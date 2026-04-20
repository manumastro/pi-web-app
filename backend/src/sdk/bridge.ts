import {
  AgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import type { Config } from '../config/index.js';
import {
  modelKey,
  parseModelKey,
  resolveModelKey,
  summarizeModels,
  type ModelLike,
  type ModelSummary,
} from '../models/resolver.js';
import type { Session, SessionStore } from '../sessions/store.js';
import type { SseManager } from '../sse/manager.js';
import type { SseEvent } from './events.js';

export interface PromptRequest {
  sessionId?: string;
  cwd?: string;
  message: string;
  model?: string;
  messageId?: string;
}

export interface PromptResult {
  sessionId: string;
  assistantMessage: string;
}

export interface SdkBridge {
  listModels: (selectedModelKey?: string) => Promise<ModelSummary[]>;
  prompt: (request: PromptRequest) => Promise<PromptResult>;
  abort: (sessionId: string) => Promise<void>;
  setModel: (sessionId: string, modelKey: string) => Promise<void>;
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

function extractStringField(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function formatToolInput(input: unknown, toolName?: string): string {
  if (!input) {
    return '';
  }

  if (typeof input === 'string') {
    return input;
  }

  if (typeof input !== 'object') {
    return String(input);
  }

  const record = input as Record<string, unknown>;
  const normalizedToolName = (toolName ?? '').toLowerCase();

  if (normalizedToolName === 'bash') {
    const command = extractStringField(record, ['command']);
    if (command) return command;
  }

  if (normalizedToolName === 'task') {
    const prompt = extractStringField(record, ['prompt']);
    if (prompt) return prompt;
    const description = extractStringField(record, ['description']);
    if (description) return description;
  }

  const preferredKeys = ['text', 'content', 'message', 'output', 'stdout', 'result', 'query', 'path', 'filePath', 'file_path', 'command', 'description', 'prompt'];
  const preferredValue = extractStringField(record, preferredKeys);
  if (preferredValue) {
    return preferredValue;
  }

  const entries = Object.entries(record)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase().replace(/^./, (first) => first.toUpperCase());
      if (typeof value === 'object') {
        return `${label}: ${JSON.stringify(value)}`;
      }
      return `${label}: ${String(value)}`;
    });

  if (entries.length === 1) {
    const single = entries[0];
    if (single) {
      return single.slice(single.indexOf(':') + 2);
    }
  }

  return entries.join('\n');
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

type ExtendedAgentSessionEvent =
  | AgentSessionEvent
  | {
      type: 'question';
      questionId: string;
      question: string;
      options?: string[];
    }
  | {
      type: 'permission';
      permissionId: string;
      action: string;
      resource: string;
    };

function emit(manager: SseManager, event: SseEvent): void {
  manager.broadcast(event);
}

function disableSdkAutoCompaction(): void {
  const prototype = AgentSession.prototype as unknown as {
    _checkCompaction?: (...args: unknown[]) => Promise<void>;
    _runAutoCompaction?: (...args: unknown[]) => Promise<void>;
  };

  const noopCompactionHook = async (): Promise<void> => undefined;
  prototype._checkCompaction = noopCompactionHook;
  prototype._runAutoCompaction = noopCompactionHook;
}

disableSdkAutoCompaction();

export function createSdkBridge(params: {
  config: Config;
  sessionStore: SessionStore;
  sseManager: SseManager;
}): SdkBridge {
  const { config, sessionStore, sseManager } = params;
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const sessions = new Map<string, ActiveAgentSession>();

  function refreshModels(): ModelLike[] {
    modelRegistry.refresh();
    return modelRegistry.getAll() as ModelLike[];
  }

  function ensureStoredSession(sessionId: string, cwd: string, modelKeyOrId?: string): Session {
    const models = refreshModels();
    const resolvedModelKey = resolveModelKey(models, modelKeyOrId, config.model);
    return sessionStore.getSession(sessionId) ?? sessionStore.createSession(cwd, resolvedModelKey, sessionId);
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

  function appendTurnMessage(
    sessionId: string,
    role: Session['messages'][number]['role'],
    content: string,
    extra?: Partial<Pick<Session['messages'][number], 'messageId' | 'toolName' | 'toolCallId' | 'success'>>,
  ): void {
    const message: Omit<Session['messages'][number], 'id' | 'timestamp'> = { role, content };
    if (extra?.messageId !== undefined) message.messageId = extra.messageId;
    if (extra?.toolName !== undefined) message.toolName = extra.toolName;
    if (extra?.toolCallId !== undefined) message.toolCallId = extra.toolCallId;
    if (extra?.success !== undefined) message.success = extra.success;
    sessionStore.addMessage(sessionId, message);
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
    settingsManager.applyOverrides({
      compaction: { enabled: false },
    });
    const { session } = await createAgentSession({
      cwd: stored.cwd,
      sessionManager: SessionManager.inMemory(),
      authStorage,
      modelRegistry,
      settingsManager,
    });

    session.agent.sessionId = stored.id;

    const modelKeyRef = resolveModelKey(refreshModels(), stored.model ?? modelId ?? config.model, config.model);
    sessionStore.updateSession(stored.id, { model: modelKeyRef });
    const parsedModel = parseModelKey(modelKeyRef);
    if (parsedModel) {
      const model = modelRegistry.find(parsedModel.provider, parsedModel.modelId);
      if (model) {
        session.setModel(model as never);
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

    if (active.assistantContent.length > 0 || aborted) {
      const extra = active.assistantMessageId ? { messageId: active.assistantMessageId } : undefined;
      appendTurnMessage(sessionId, 'assistant', active.assistantContent, extra);
    }

    sessionStore.updateSession(sessionId, { status: 'idle' });
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

  function handleAgentEvent(active: ActiveAgentSession, event: ExtendedAgentSessionEvent): void {
    switch (event.type) {
      case 'agent_start':
      case 'turn_start':
        sessionStore.updateSession(active.sessionId, { status: 'busy' });
        break;
      case 'message_start': {
        const text = extractMessageText(event.message as { content?: unknown });
        if (event.message.role === 'assistant') {
          active.assistantContent = text;
          if (!active.assistantMessageId) {
            active.assistantMessageId = config.generateSessionId();
          }
        } else {
          appendIfMissing(active.sessionId, event.message.role as Session['messages'][number]['role'], text);
        }
        break;
      }
      case 'message_update':
        if (event.assistantMessageEvent.type === 'text_delta') {
          ensureAssistantPlaceholder(active.sessionId);
          active.assistantContent += event.assistantMessageEvent.delta;
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
      case 'tool_execution_start': {
        const inputText = formatToolInput(event.args, event.toolName);
        const turnId = active.assistantMessageId ?? config.generateSessionId();
        active.assistantMessageId = turnId;
        appendTurnMessage(active.sessionId, 'tool_call', inputText, {
          messageId: turnId,
          toolName: event.toolName,
          toolCallId: event.toolCallId,
        });
        emit(sseManager, {
          type: 'tool_call',
          sessionId: active.sessionId,
          messageId: turnId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: typeof event.args === 'object' && event.args !== null ? (event.args as Record<string, unknown>) : { value: event.args },
          timestamp: now(),
        });
        break;
      }
      case 'tool_execution_update': {
        const turnId = active.assistantMessageId ?? config.generateSessionId();
        emit(sseManager, {
          type: 'tool_result',
          sessionId: active.sessionId,
          messageId: turnId,
          toolCallId: event.toolCallId,
          result: stringifyResult(event.partialResult),
          success: true,
          timestamp: now(),
        });
        break;
      }
      case 'tool_execution_end': {
        const turnId = active.assistantMessageId ?? config.generateSessionId();
        appendTurnMessage(active.sessionId, 'tool_result', stringifyResult(event.result), {
          messageId: turnId,
          toolCallId: event.toolCallId,
          success: !event.isError,
        });
        emit(sseManager, {
          type: 'tool_result',
          sessionId: active.sessionId,
          messageId: turnId,
          toolCallId: event.toolCallId,
          result: stringifyResult(event.result),
          success: !event.isError,
          timestamp: now(),
        });
        break;
      }
      case 'question':
        emit(sseManager, {
          type: 'question',
          sessionId: active.sessionId,
          messageId: active.assistantMessageId ?? config.generateSessionId(),
          questionId: event.questionId,
          question: event.question,
          options: event.options,
          timestamp: now(),
        });
        break;
      case 'permission':
        emit(sseManager, {
          type: 'permission',
          sessionId: active.sessionId,
          messageId: active.assistantMessageId ?? config.generateSessionId(),
          permissionId: event.permissionId,
          action: event.action,
          resource: event.resource,
          timestamp: now(),
        });
        break;
      case 'message_end': {
        const text = extractMessageText(event.message as { content?: unknown });
        const role = String((event.message as { role?: unknown }).role ?? '');
        if (role === 'assistant') {
          active.assistantContent = text || active.assistantContent;
        } else if (role === 'user') {
          appendIfMissing(active.sessionId, 'user', text);
        } else if (role === 'toolResult' || role === 'tool_result' || role === 'tool_call') {
          break;
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
    const session = ensureStoredSession(sessionId, cwd, request.model);
    const resolvedModelKey = resolveModelKey(refreshModels(), request.model, session.model ?? config.model);
    const assistantMessageId = request.messageId ?? config.generateSessionId();

    sessionStore.updateSession(session.id, { status: 'busy', cwd, model: resolvedModelKey });
    sessionStore.addMessage(session.id, { role: 'user', content: request.message });

    try {
      const active = await getOrCreateAgentSession(session.id, cwd, resolvedModelKey);
      active.assistantMessageId = assistantMessageId;
      active.assistantContent = '';
      active.aborted = false;

      const parsed = parseModelKey(resolvedModelKey);
      if (parsed) {
        const model = modelRegistry.find(parsed.provider, parsed.modelId);
        if (model) {
          active.agentSession.setModel(model as never);
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

  async function abort(sessionId: string): Promise<void> {
    const active = sessions.get(sessionId);
    if (!active) {
      const current = sessionStore.getSession(sessionId);
      if (current) {
        sessionStore.updateSession(sessionId, { status: 'idle' });
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

  async function listModels(selectedModelKey?: string): Promise<ModelSummary[]> {
    refreshModels();
    // Get ALL models (not just available ones), matching /scoped-model behavior
    const allModels = modelRegistry.getAll() as ModelLike[];
    const availableModels = modelRegistry.getAvailable() as ModelLike[];
    const availableKeys = new Set(availableModels.map((model) => modelKey(model)));
    return summarizeModels({ models: allModels, availableKeys, selectedKey: selectedModelKey ?? config.model });
  }

  async function setModel(sessionId: string, modelKeyInput: string): Promise<void> {
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return;
    }

    const resolvedModelKey = resolveModelKey(refreshModels(), modelKeyInput, session.model ?? config.model);
    sessionStore.updateSession(sessionId, { model: resolvedModelKey });

    const active = await getOrCreateAgentSession(sessionId, session.cwd, resolvedModelKey);
    const parsed = parseModelKey(resolvedModelKey);
    if (parsed) {
      const model = modelRegistry.find(parsed.provider, parsed.modelId);
      if (model) {
        active.agentSession.setModel(model as never);
      }
    }
  }

  return { listModels, prompt, abort, setModel };
}
