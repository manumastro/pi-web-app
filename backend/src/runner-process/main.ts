import readline from 'node:readline';
import crypto from 'node:crypto';
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  createAgentSessionServices,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import type { ThinkingLevel } from '@mariozechner/pi-ai';
import { RunnerCommandSchema, type RunnerCommand, type RunnerEvent, type RunnerModelRef } from '../runner/protocol.js';

interface RunnerSession {
  sessionId: string;
  cwd: string;
  session: AgentSession;
  assistantMessageId: string | null;
  aborted: boolean;
  unsubscribe: () => void;
}

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const sessions = new Map<string, RunnerSession>();
const runnerId = crypto.randomUUID();

function emit(event: RunnerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function commandResult(requestId: string, ok: boolean, data?: unknown, error?: string): void {
  emit({
    type: 'command_result',
    requestId,
    ok,
    ...(data !== undefined ? { data } : {}),
    ...(error !== undefined ? { error } : {}),
  });
}

function modelKey(model: { provider: string; id: string }): string {
  return `${model.provider}/${model.id}`;
}

function modelMatchesPattern(model: { provider: string; id: string; name?: string }, pattern: string): boolean {
  const normalized = pattern.trim();
  if (!normalized) return false;
  const key = modelKey(model);
  if (normalized === key || normalized === model.id) return true;
  if (normalized.endsWith('/*')) return model.provider === normalized.slice(0, -2);
  return model.id.includes(normalized) || key.includes(normalized) || (model.name?.toLowerCase().includes(normalized.toLowerCase()) ?? false);
}

async function warmModelRegistry(cwd = process.cwd()): Promise<void> {
  const settingsManager = SettingsManager.create(cwd);
  await createAgentSessionServices({ cwd, authStorage, modelRegistry, settingsManager });
}

function modelsForPattern(models: ReturnType<ModelRegistry['getAvailable']>, pattern: string) {
  const normalized = pattern.trim();
  const exact = models.find((model) => modelKey(model) === normalized || model.id === normalized);
  if (exact) return [exact];
  return models.filter((model) => modelMatchesPattern(model, normalized));
}

function refreshAvailableModels(cwd = process.cwd()) {
  modelRegistry.refresh();
  const available = modelRegistry.getAvailable();
  const enabledPatterns = SettingsManager.create(cwd).getEnabledModels();
  const scoped = enabledPatterns && enabledPatterns.length > 0
    ? enabledPatterns
        .flatMap((pattern) => modelsForPattern(available, pattern))
        .filter((model, index, models) => models.findIndex((candidate) => modelKey(candidate) === modelKey(model)) === index)
    : [...available].sort((left, right) => left.provider === right.provider ? left.id.localeCompare(right.id) : left.provider.localeCompare(right.provider));

  return scoped.map((model) => ({
    provider: model.provider,
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
  }));
}

function findModel(ref?: RunnerModelRef) {
  if (!ref) return undefined;
  modelRegistry.refresh();
  return modelRegistry.find(ref.provider, ref.id);
}

function currentModel(active: RunnerSession): RunnerModelRef | null {
  const maybe = active.session as unknown as { model?: { provider?: string; id?: string } };
  const model = maybe.model;
  if (model?.provider && model.id) return { provider: model.provider, id: model.id };
  return null;
}

function emitSessionActive(active: RunnerSession): void {
  emit({
    type: 'session_active',
    sessionId: active.sessionId,
    cwd: active.cwd,
    model: currentModel(active),
    thinkingLevel: active.session.thinkingLevel as ThinkingLevel | undefined,
    availableModels: refreshAvailableModels(active.cwd),
  });
}

function emitSessionMetadata(active: RunnerSession): void {
  emit({
    type: 'session_metadata_update',
    sessionId: active.sessionId,
    model: currentModel(active),
    thinkingLevel: active.session.thinkingLevel as ThinkingLevel | undefined,
    availableModels: refreshAvailableModels(active.cwd),
  });
}

function extractMessageText(message: { content?: unknown }): string {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content.map((part) => {
    if (typeof part === 'string') return part;
    if (part && typeof part === 'object') {
      const record = part as Record<string, unknown>;
      for (const key of ['text', 'content', 'refusal', 'thinking']) {
        if (typeof record[key] === 'string') return record[key];
      }
    }
    return '';
  }).join('').trim();
}

function normalizeInput(input: unknown): unknown {
  if (input && typeof input === 'object') return input;
  return { value: input };
}

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function toAgentMessages(
  messages: Array<{ role: string; content: string; timestamp?: string | undefined }>,
  active: AgentSession,
): unknown[] {
  const activeModel = currentModel({ session: active } as RunnerSession);
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => {
      const timestamp = message.timestamp ? Date.parse(message.timestamp) : Date.now();
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: message.content }],
          api: 'unknown',
          provider: activeModel?.provider ?? 'unknown',
          model: activeModel?.id ?? 'unknown',
          usage: emptyUsage(),
          stopReason: 'stop',
          timestamp,
        };
      }

      return {
        role: 'user',
        content: message.content,
        timestamp,
      };
    });
}

type ExtendedAgentSessionEvent = AgentSessionEvent | {
  type: 'question';
  questionId: string;
  question: string;
  options?: string[];
} | {
  type: 'permission';
  permissionId: string;
  action: string;
  resource: string;
};

function handleAgentEvent(active: RunnerSession, event: ExtendedAgentSessionEvent): void {
  switch (event.type) {
    case 'message_start': {
      if (event.message.role === 'assistant' && !active.assistantMessageId) {
        active.assistantMessageId = crypto.randomUUID();
      }
      break;
    }
    case 'message_update': {
      if (!active.assistantMessageId) active.assistantMessageId = crypto.randomUUID();
      if (event.assistantMessageEvent.type === 'text_delta') {
        emit({ type: 'text', sessionId: active.sessionId, messageId: active.assistantMessageId, delta: event.assistantMessageEvent.delta });
      } else if (event.assistantMessageEvent.type === 'thinking_delta') {
        emit({ type: 'thinking', sessionId: active.sessionId, messageId: active.assistantMessageId, delta: event.assistantMessageEvent.delta });
      }
      break;
    }
    case 'tool_execution_start': {
      if (!active.assistantMessageId) active.assistantMessageId = crypto.randomUUID();
      emit({
        type: 'tool_call',
        sessionId: active.sessionId,
        messageId: active.assistantMessageId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: normalizeInput(event.args),
      });
      break;
    }
    case 'tool_execution_update': {
      if (!active.assistantMessageId) active.assistantMessageId = crypto.randomUUID();
      emit({
        type: 'tool_result',
        sessionId: active.sessionId,
        messageId: active.assistantMessageId,
        toolCallId: event.toolCallId,
        output: event.partialResult,
        success: true,
      });
      break;
    }
    case 'tool_execution_end': {
      if (!active.assistantMessageId) active.assistantMessageId = crypto.randomUUID();
      emit({
        type: 'tool_result',
        sessionId: active.sessionId,
        messageId: active.assistantMessageId,
        toolCallId: event.toolCallId,
        output: event.result,
        success: !event.isError,
      });
      break;
    }
    case 'message_end': {
      const role = String((event.message as { role?: unknown }).role ?? '');
      if (role === 'assistant') {
        const text = extractMessageText(event.message as { content?: unknown });
        if (text && !active.assistantMessageId) active.assistantMessageId = crypto.randomUUID();
      }
      break;
    }
    case 'agent_end': {
      emit({
        type: 'done',
        sessionId: active.sessionId,
        messageId: active.assistantMessageId ?? crypto.randomUUID(),
        aborted: active.aborted,
      });
      active.assistantMessageId = null;
      active.aborted = false;
      emitSessionMetadata(active);
      break;
    }
    default:
      break;
  }
}

async function ensureSession(command: Extract<RunnerCommand, { type: 'start_session' | 'send_input' | 'set_model' | 'set_thinking_level' | 'abort' }>): Promise<RunnerSession> {
  const existing = sessions.get(command.sessionId);
  if (existing) return existing;

  if (!('cwd' in command)) {
    throw new Error(`Session ${command.sessionId} has not been started`);
  }

  const settingsManager = SettingsManager.create(command.cwd);
  await warmModelRegistry(command.cwd);
  settingsManager.applyOverrides({ compaction: { enabled: false } });
  const { session } = await createAgentSession({
    cwd: command.cwd,
    sessionManager: SessionManager.inMemory(),
    authStorage,
    modelRegistry,
    settingsManager,
  });
  session.agent.sessionId = command.sessionId;

  const active: RunnerSession = {
    sessionId: command.sessionId,
    cwd: command.cwd,
    session,
    assistantMessageId: null,
    aborted: false,
    unsubscribe: () => undefined,
  };
  if (command.history && command.history.length > 0) {
    session.agent.state.messages = toAgentMessages(command.history, session) as never;
  }

  active.unsubscribe = session.subscribe((event) => handleAgentEvent(active, event as ExtendedAgentSessionEvent));
  sessions.set(command.sessionId, active);
  return active;
}

async function handleCommand(command: RunnerCommand): Promise<void> {
  switch (command.type) {
    case 'start_session': {
      const active = await ensureSession(command);
      if (command.model) {
        const model = findModel(command.model);
        if (model) await active.session.setModel(model as never);
      }
      if (command.thinkingLevel) active.session.setThinkingLevel(command.thinkingLevel);
      emitSessionActive(active);
      commandResult(command.requestId, true, { sessionId: command.sessionId });
      break;
    }
    case 'send_input': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      active.assistantMessageId = command.messageId ?? crypto.randomUUID();
      active.aborted = false;
      await active.session.prompt(command.text);
      commandResult(command.requestId, true, { sessionId: command.sessionId });
      break;
    }
    case 'set_model': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      const model = findModel(command.model);
      if (!model) {
        emit({ type: 'model_set_result', sessionId: command.sessionId, requestId: command.requestId, ok: false, model: command.model, error: 'Model is not configured for this runner.' });
        commandResult(command.requestId, false, undefined, 'Model is not configured for this runner.');
        return;
      }
      await active.session.setModel(model as never);
      emit({
        type: 'model_set_result',
        sessionId: command.sessionId,
        requestId: command.requestId,
        ok: true,
        model: command.model,
      });
      emitSessionMetadata(active);
      commandResult(command.requestId, true, { model: command.model });
      break;
    }
    case 'set_thinking_level': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      active.session.setThinkingLevel(command.level);
      emitSessionMetadata(active);
      commandResult(command.requestId, true, { thinkingLevel: active.session.thinkingLevel });
      break;
    }
    case 'abort': {
      const active = sessions.get(command.sessionId);
      if (active) {
        active.aborted = true;
        active.session.abort();
        active.session.agent.waitForIdle().catch(() => undefined);
      }
      commandResult(command.requestId, true);
      break;
    }
    case 'get_capabilities': {
      const active = command.sessionId ? sessions.get(command.sessionId) : undefined;
      await warmModelRegistry(active?.cwd ?? process.cwd());
      commandResult(command.requestId, true, {
        model: active ? currentModel(active) : null,
        thinkingLevel: active?.session.thinkingLevel,
        availableModels: refreshAvailableModels(active?.cwd),
      });
      break;
    }
    case 'shutdown': {
      commandResult(command.requestId, true);
      for (const active of sessions.values()) active.unsubscribe();
      process.exit(0);
    }
  }
}

emit({ type: 'ready', runnerId, pid: process.pid, version: '0.1.0' });

const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (!line.trim()) return;
  void (async () => {
    let requestId = 'unknown';
    try {
      const command = RunnerCommandSchema.parse(JSON.parse(line));
      requestId = command.requestId;
      await handleCommand(command);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      commandResult(requestId, false, undefined, message);
      emit({ type: 'error', error: message, fatal: false });
    }
  })();
});
