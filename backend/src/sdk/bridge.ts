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

  function getSessionIdOrCreate(): string {
    return config.generateSessionId();
  }

  async function getOrCreateAgentSession(sessionId: string, cwd: string, modelId?: string): Promise<ActiveAgentSession> {
    const existing = sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const stored = sessionStore.getSession(sessionId) ?? sessionStore.createSession(cwd, resolveModelId(modelId, config.model), sessionId);
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

  function ensureAssistantPlaceholder(sessionId: string): ActiveAgentSession | undefined {
    const active = sessions.get(sessionId);
    if (!active) {
      return undefined;
    }

    if (!active.assistantMessageId) {
      active.assistantMessageId = getSessionIdOrCreate();
    }

    return active;
  }

  function updateAssistantMessage(sessionId: string, chunk: string): void {
    const active = ensureAssistantPlaceholder(sessionId);
    if (!active) {
      return;
    }

    active.assistantContent += chunk;
    const current = sessionStore.getSession(sessionId);
    if (!current) {
      return;
    }

    const messages = current.messages;
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') {
      sessionStore.updateSession(sessionId, {
        messages: [
          ...messages.slice(0, -1),
          {
            ...last,
            content: active.assistantContent,
          },
        ],
      });
    }
  }

  function finalizeAssistantMessage(sessionId: string, aborted: boolean): void {
    const active = sessions.get(sessionId);
    if (!active) {
      return;
    }

    const current = sessionStore.getSession(sessionId);
    if (current && active.assistantContent.length > 0) {
      const messages = current.messages;
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        sessionStore.updateSession(sessionId, {
          messages: [
            ...messages.slice(0, -1),
            {
              ...last,
              content: active.assistantContent,
            },
          ],
        });
      }
    }

    sessionStore.updateSession(sessionId, { status: aborted ? 'done' : 'done' });
    emit(sseManager, {
      type: 'done',
      sessionId,
      messageId: active.assistantMessageId ?? getSessionIdOrCreate(),
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
      case 'message_start':
        if (event.message.role === 'assistant') {
          active.assistantContent = '';
          if (!active.assistantMessageId) {
            active.assistantMessageId = getSessionIdOrCreate();
          }
        }
        break;
      case 'message_update':
        if (event.assistantMessageEvent.type === 'text_delta') {
          updateAssistantMessage(active.sessionId, event.assistantMessageEvent.delta);
          emit(sseManager, {
            type: 'text_chunk',
            sessionId: active.sessionId,
            messageId: active.assistantMessageId ?? getSessionIdOrCreate(),
            content: event.assistantMessageEvent.delta,
            timestamp: now(),
          });
        } else if (event.assistantMessageEvent.type === 'thinking_delta') {
          emit(sseManager, {
            type: 'thinking',
            sessionId: active.sessionId,
            messageId: active.assistantMessageId ?? getSessionIdOrCreate(),
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
          messageId: active.assistantMessageId ?? getSessionIdOrCreate(),
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
          messageId: active.assistantMessageId ?? getSessionIdOrCreate(),
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
          messageId: active.assistantMessageId ?? getSessionIdOrCreate(),
          toolCallId: event.toolCallId,
          result: stringifyResult(event.result),
          success: !event.isError,
          timestamp: now(),
        });
        break;
      case 'message_end':
        if (event.message.role === 'assistant' && event.message.content) {
          active.assistantContent = typeof event.message.content === 'string'
            ? event.message.content
            : JSON.stringify(event.message.content);
        }
        break;
      case 'agent_end':
        finalizeAssistantMessage(active.sessionId, active.aborted);
        break;
      default:
        break;
    }
  }

  async function prompt(request: PromptRequest): Promise<PromptResult> {
    const sessionId = request.sessionId ?? getSessionIdOrCreate();
    const cwd = request.cwd ?? config.sdkCwd;
    const resolvedModelId = resolveModelId(request.model, config.model);
    const session = sessionStore.getSession(sessionId) ?? sessionStore.createSession(cwd, resolvedModelId, sessionId);

    sessionStore.updateSession(session.id, { status: 'prompting', cwd, model: resolvedModelId });
    sessionStore.addMessage(session.id, { role: 'user', content: request.message });
    sessionStore.addMessage(session.id, { role: 'assistant', content: '' });

    const active = await getOrCreateAgentSession(session.id, cwd, resolvedModelId);
    active.assistantMessageId = getSessionIdOrCreate();
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
        messageId: getSessionIdOrCreate(),
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

  return { prompt, abort, setModel };
}
