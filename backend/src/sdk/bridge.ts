import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import type { Config } from '../config/index.js';
import { findModelById, resolveModelId } from '../models/resolver.js';
import type { Session, SessionStore } from '../sessions/store.js';
import type { SseManager } from '../sse/manager.js';
import type { SseEvent } from './events.js';

export interface PromptRequest {
  sessionId?: string;
  cwd?: string;
  message: string;
  model?: string;
}

export interface PromptResult {
  sessionId: string;
  assistantMessage: string;
}

export interface SdkBridge {
  prompt: (request: PromptRequest) => Promise<PromptResult>;
  steer: (sessionId: string, message: string) => Promise<void>;
  followUp: (sessionId: string, message: string) => Promise<void>;
  abort: (sessionId: string) => Promise<void>;
  setModel: (sessionId: string, modelId: string) => Promise<void>;
}

interface ActiveAgentSession {
  sessionId: string;
  agentSession: AgentSession;
  unsubscribe: () => void;
  assistantMessageId: string | null;
  assistantContent: string;
  aborted: boolean;
}

function now(): string {
  return new Date().toISOString();
}

function toAgentMessages(messages: Session['messages']): unknown[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    timestamp: Date.parse(message.timestamp),
  }));
}

function stringifyResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractMessageText(message: { content?: unknown }): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object') {
          const maybeText = (part as { text?: unknown; content?: unknown; refusal?: unknown; thinking?: unknown }).text;
          if (typeof maybeText === 'string') {
            return maybeText;
          }
          const maybeContent = (part as { content?: unknown }).content;
          if (typeof maybeContent === 'string') {
            return maybeContent;
          }
          const maybeRefusal = (part as { refusal?: unknown }).refusal;
          if (typeof maybeRefusal === 'string') {
            return maybeRefusal;
          }
          const maybeThinking = (part as { thinking?: unknown }).thinking;
          if (typeof maybeThinking === 'string') {
            return maybeThinking;
          }
        }
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

function emit(manager: SseManager, event: SseEvent): void {
  manager.broadcast(event);
}

export function createSdkBridge(params: {
  config: Config;
  sessionStore: SessionStore;
  sseManager: SseManager;
}): SdkBridge {
  const { config, sessionStore, sseManager } = params;
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const sessions = new Map<string, ActiveAgentSession>();

  function ensureStoredSession(sessionId: string, cwd: string, modelId?: string): Session {
    return sessionStore.getSession(sessionId) ?? sessionStore.createSession(cwd, resolveModelId(modelId, config.model), sessionId);
  }

  function getSessionMessage(sessionId: string): Session | undefined {
    return sessionStore.getSession(sessionId);
  }

  function ensureAssistantPlaceholder(sessionId: string): ActiveAgentSession | undefined {
    const active = sessions.get(sessionId);
    if (!active) {
      return undefined;
    }

    if (!active.assistantMessageId) {
      active.assistantMessageId = config.generateSessionId();
    }

    return active;
  }

  function appendIfMissing(sessionId: string, role: Session['messages'][number]['role'], content: string): void {
    const session = getSessionMessage(sessionId);
    if (!session) {
      return;
    }

    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
      const message = session.messages[index];
      if (!message) {
        continue;
      }
      if (message.role === role && message.content === content && index >= session.messages.length - 2) {
        return;
      }
    }

    sessionStore.addMessage(sessionId, { role, content });
  }

  function updateLastAssistantMessage(sessionId: string, content: string): void {
    const current = getSessionMessage(sessionId);
    if (!current) {
      return;
    }

    const last = current.messages.at(-1);
    if (!last || last.role !== 'assistant') {
      sessionStore.addMessage(sessionId, { role: 'assistant', content });
      return;
    }

    sessionStore.updateSession(sessionId, {
      messages: [...current.messages.slice(0, -1), { ...last, content }],
    });
  }

  function emitSdkError(sessionId: string, message: unknown): void {
    sessionStore.updateSession(sessionId, { status: 'error' });
    emit(sseManager, {
      type: 'error',
      sessionId,
      message: message instanceof Error ? message.message : stringifyResult(message),
      category: 'sdk',
      recoverable: true,
      timestamp: now(),
    });
  }

  async function getOrCreateAgentSession(sessionId: string, cwd: string, modelId?: string): Promise<ActiveAgentSession> {
    const existing = sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const stored = ensureStoredSession(sessionId, cwd, modelId);
    const settingsManager = SettingsManager.create(stored.cwd);
    const { session } = await createAgentSession({
      cwd: stored.cwd,
      sessionManager: SessionManager.inMemory(),
      authStorage,
      modelRegistry,
      settingsManager,
    });

    session.agent.sessionId = stored.id;

    const resolvedModel = findModelById(stored.model ?? modelId ?? config.model);
    if (resolvedModel) {
      const model = modelRegistry.find(resolvedModel.provider, resolvedModel.id);
      if (model) {
        session.setModel(model);
      }
    }

    if (stored.messages.length > 0) {
      session.agent.state.messages = toAgentMessages(stored.messages) as never;
    }

    const active: ActiveAgentSession = {
      sessionId: stored.id,
      agentSession: session,
      assistantMessageId: null,
      assistantContent: '',
      aborted: false,
      unsubscribe: () => undefined,
    };

    active.unsubscribe = session.subscribe((event) => {
      handleAgentEvent(active, event);
    });

    sessions.set(stored.id, active);
    return active;
  }

  function finalizeAssistantMessage(sessionId: string, aborted: boolean): void {
    const active = sessions.get(sessionId);
    if (!active) {
      return;
    }

    if (active.assistantContent.length > 0) {
      updateLastAssistantMessage(sessionId, active.assistantContent);
    }

    sessionStore.updateSession(sessionId, { status: 'done' });
    emit(sseManager, {
      type: 'done',
      sessionId,
      messageId: active.assistantMessageId ?? config.generateSessionId(),
      aborted,
      timestamp: now(),
    });

    active.assistantMessageId = null;
    active.assistantContent = '';
    active.aborted = false;
  }

  function handleAgentEvent(active: ActiveAgentSession, event: AgentSessionEvent): void {
    switch (event.type) {
      case 'agent_start':
      case 'turn_start':
        sessionStore.updateSession(active.sessionId, { status: 'answering' });
        break;
      case 'message_start': {
        const text = extractMessageText(event.message as { content?: unknown });
        appendIfMissing(active.sessionId, event.message.role as Session['messages'][number]['role'], text);
        if (event.message.role === 'assistant') {
          active.assistantContent = text;
          if (!active.assistantMessageId) {
            active.assistantMessageId = config.generateSessionId();
          }
        }
        break;
      }
      case 'message_update':
        if (event.assistantMessageEvent.type === 'text_delta') {
          ensureAssistantPlaceholder(active.sessionId);
          active.assistantContent += event.assistantMessageEvent.delta;
          updateLastAssistantMessage(active.sessionId, active.assistantContent);
          emit(sseManager, {
            type: 'text_chunk',
            sessionId: active.sessionId,
            messageId: active.assistantMessageId ?? config.generateSessionId(),
            content: event.assistantMessageEvent.delta,
            timestamp: now(),
          });
        } else if (event.assistantMessageEvent.type === 'thinking_delta') {
          emit(sseManager, {
            type: 'thinking',
            sessionId: active.sessionId,
            messageId: active.assistantMessageId ?? config.generateSessionId(),
            content: event.assistantMessageEvent.delta,
            done: false,
            timestamp: now(),
          });
        }
        break;
      case 'tool_execution_start':
        emit(sseManager, {
          type: 'tool_call',
          sessionId: active.sessionId,
          messageId: active.assistantMessageId ?? config.generateSessionId(),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: typeof event.args === 'object' && event.args !== null ? (event.args as Record<string, unknown>) : { value: event.args },
          timestamp: now(),
        });
        break;
      case 'tool_execution_update':
        emit(sseManager, {
          type: 'tool_result',
          sessionId: active.sessionId,
          messageId: active.assistantMessageId ?? config.generateSessionId(),
          toolCallId: event.toolCallId,
          result: stringifyResult(event.partialResult),
          success: true,
          timestamp: now(),
        });
        break;
      case 'tool_execution_end':
        emit(sseManager, {
          type: 'tool_result',
          sessionId: active.sessionId,
          messageId: active.assistantMessageId ?? config.generateSessionId(),
          toolCallId: event.toolCallId,
          result: stringifyResult(event.result),
          success: !event.isError,
          timestamp: now(),
        });
        break;
      case 'message_end': {
        const text = extractMessageText(event.message as { content?: unknown });
        if (event.message.role === 'assistant') {
          active.assistantContent = text || active.assistantContent;
          updateLastAssistantMessage(active.sessionId, active.assistantContent);
        } else if (event.message.role === 'user') {
          appendIfMissing(active.sessionId, 'user', text);
        }
        break;
      }
      case 'agent_end':
        finalizeAssistantMessage(active.sessionId, active.aborted);
        break;
      default:
        break;
    }
  }

  async function prompt(request: PromptRequest): Promise<PromptResult> {
    const sessionId = request.sessionId ?? config.generateSessionId();
    const cwd = request.cwd ?? config.sdkCwd;
    const resolvedModelId = resolveModelId(request.model, config.model);
    const session = ensureStoredSession(sessionId, cwd, resolvedModelId);

    sessionStore.updateSession(session.id, { status: 'prompting', cwd, model: resolvedModelId });
    sessionStore.addMessage(session.id, { role: 'user', content: request.message });
    sessionStore.addMessage(session.id, { role: 'assistant', content: '' });

    try {
      const active = await getOrCreateAgentSession(session.id, cwd, resolvedModelId);
      active.assistantMessageId = config.generateSessionId();
      active.assistantContent = '';
      active.aborted = false;

      const modelInfo = findModelById(resolvedModelId);
      if (modelInfo) {
        const model = modelRegistry.find(modelInfo.provider, modelInfo.id);
        if (model) {
          active.agentSession.setModel(model);
        }
      }

      await active.agentSession.prompt(request.message);

      const updated = sessionStore.getSession(session.id);
      return {
        sessionId: session.id,
        assistantMessage: updated?.messages.at(-1)?.content ?? '',
      };
    } catch (cause) {
      emitSdkError(session.id, cause);
      throw cause;
    }
  }

  async function dispatchQueuedMessage(
    sessionId: string,
    message: string,
    mode: 'steer' | 'followUp',
    cwd?: string,
    model?: string,
  ): Promise<void> {
    const session = ensureStoredSession(sessionId, cwd ?? config.sdkCwd, model ?? config.model);
    const active = await getOrCreateAgentSession(session.id, session.cwd, session.model ?? model);

    if (!active.agentSession.isStreaming) {
      const promptRequest: PromptRequest = {
        sessionId: session.id,
        cwd: session.cwd,
        message,
      };
      if (session.model) {
        promptRequest.model = session.model;
      }
      await prompt(promptRequest);
      return;
    }

    if (mode === 'steer') {
      await active.agentSession.steer(message);
    } else {
      await active.agentSession.followUp(message);
    }
  }

  async function abort(sessionId: string): Promise<void> {
    const active = sessions.get(sessionId);
    if (!active) {
      const current = sessionStore.getSession(sessionId);
      if (current) {
        sessionStore.updateSession(sessionId, { status: 'done' });
      }
      emit(sseManager, {
        type: 'done',
        sessionId,
        messageId: config.generateSessionId(),
        aborted: true,
        timestamp: now(),
      });
      return;
    }

    active.aborted = true;
    active.agentSession.abort();
    active.agentSession.agent.waitForIdle().catch(() => undefined);
    finalizeAssistantMessage(sessionId, true);
  }

  async function setModel(sessionId: string, modelId: string): Promise<void> {
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return;
    }

    const resolvedModelId = resolveModelId(modelId, session.model ?? config.model);
    sessionStore.updateSession(sessionId, { model: resolvedModelId });

    const active = await getOrCreateAgentSession(sessionId, session.cwd, resolvedModelId);
    const modelInfo = findModelById(resolvedModelId);
    if (!modelInfo) {
      return;
    }

    const model = modelRegistry.find(modelInfo.provider, modelInfo.id);
    if (model) {
      active.agentSession.setModel(model);
    }
  }

  async function steer(sessionId: string, message: string): Promise<void> {
    await dispatchQueuedMessage(sessionId, message, 'steer');
  }

  async function followUp(sessionId: string, message: string): Promise<void> {
    await dispatchQueuedMessage(sessionId, message, 'followUp');
  }

  return { prompt, steer, followUp, abort, setModel };
}
