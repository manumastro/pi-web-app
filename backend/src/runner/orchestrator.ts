import type { Config } from '../config/index.js';
import { THINKING_LEVELS, type ThinkingLevel } from '../types/thinking.js';
import { modelKey, parseModelKey, summarizeModels, type ModelLike, type ModelSummary } from '../models/resolver.js';
import { getHiddenModelKeysFromEnv, isHiddenModelKey } from '../models/visibility.js';
import type { Session, SessionStore } from '../sessions/store.js';
import type { SseManager } from '../sse/manager.js';
import type { SseEvent } from '../events.js';
import { RunnerProcessClient } from './child-process.js';
import type { RunnerEvent, RunnerModelInfo } from './protocol.js';

export interface PromptRequest {
  sessionId?: string;
  cwd?: string;
  message: string;
  model?: string;
  messageId?: string;
  thinkingLevel?: ThinkingLevel | undefined;
}

export interface PromptResult {
  sessionId: string;
  assistantMessage: string;
}

export interface RunnerOrchestrator {
  listModels: (selectedModelKey?: string) => Promise<ModelSummary[]>;
  prompt: (request: PromptRequest) => Promise<PromptResult>;
  abort: (sessionId: string) => Promise<void>;
  answerQuestion: (sessionId: string, questionId: string, answer: string) => Promise<void>;
  setModel: (sessionId: string, modelKey: string) => Promise<void>;
  setThinkingLevel: (sessionId: string, thinkingLevel: ThinkingLevel) => Promise<void>;
  getThinkingLevels: (sessionId: string) => Promise<{ currentLevel: ThinkingLevel | undefined; availableLevels: ThinkingLevel[] }>;
  dispose: () => Promise<void>;
}

interface ActiveTurn {
  assistantMessageId: string | null;
  assistantContent: string;
}

function now(): string {
  return new Date().toISOString();
}

function emit(manager: SseManager, event: SseEvent): void {
  manager.broadcast(event);
}

function stringifyResult(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toModelLike(model: RunnerModelInfo): ModelLike {
  return {
    provider: model.provider,
    id: model.id,
    ...(model.name !== undefined ? { name: model.name } : {}),
    ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
    ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
  };
}

function toRunnerHistory(messages: Session['messages']) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    ...(message.messageId !== undefined ? { messageId: message.messageId } : {}),
    ...(message.toolName !== undefined ? { toolName: message.toolName } : {}),
    ...(message.toolCallId !== undefined ? { toolCallId: message.toolCallId } : {}),
    ...(message.success !== undefined ? { success: message.success } : {}),
  }));
}

export function createRunnerOrchestrator(params: {
  config: Config;
  sessionStore: SessionStore;
  sseManager: SseManager;
  runner?: RunnerProcessClient;
}): RunnerOrchestrator {
  const { config, sessionStore, sseManager } = params;
  const runner = params.runner ?? new RunnerProcessClient();
  const availableModelsBySession = new Map<string, RunnerModelInfo[]>();
  const globalAvailableModels: RunnerModelInfo[] = [];
  const activeTurns = new Map<string, ActiveTurn>();
  const hiddenModelKeys = getHiddenModelKeysFromEnv();

  runner.on('event', (event: RunnerEvent) => {
    handleRunnerEvent(event);
  });
  runner.on('error', (cause) => {
    emit(sseManager, {
      type: 'error',
      sessionId: 'runner',
      message: cause instanceof Error ? cause.message : String(cause),
      category: 'runner',
      recoverable: true,
      timestamp: now(),
    });
  });
  runner.on('exit', ({ code, signal }: { code: number | null; signal: NodeJS.Signals | null }) => {
    const message = `Pi runner exited with code ${String(code)} signal ${String(signal)}`;
    const affectedSessions = activeTurns.size > 0 ? Array.from(activeTurns.keys()) : ['runner'];
    for (const sessionId of affectedSessions) {
      if (sessionId !== 'runner') {
        sessionStore.updateSession(sessionId, { status: 'error' });
        activeTurns.delete(sessionId);
      }
      emit(sseManager, {
        type: 'error',
        sessionId,
        message,
        category: 'runner',
        recoverable: true,
        timestamp: now(),
      });
    }
  });
  runner.start();

  function requestId(): string {
    return config.generateSessionId();
  }

  function cacheModels(sessionId: string | undefined, models: RunnerModelInfo[]): void {
    const visibleModels = models.filter((model) => !isHiddenModelKey(modelKey(model), hiddenModelKeys));
    globalAvailableModels.splice(0, globalAvailableModels.length, ...visibleModels);
    if (sessionId) availableModelsBySession.set(sessionId, visibleModels);
  }

  function selectedKeyFor(sessionIdOrKey?: string): string | undefined {
    if (!sessionIdOrKey) return undefined;
    const session = sessionStore.getSession(sessionIdOrKey);
    if (session) return session.model;
    return sessionIdOrKey;
  }

  function ensureStoredSession(sessionId: string, cwd: string, model?: string): Session {
    const existing = sessionStore.getSession(sessionId);
    if (existing) return existing;
    return sessionStore.createSession(cwd, model, sessionId);
  }

  async function startSessionIfNeeded(session: Session): Promise<void> {
    const parsed = parseModelKey(session.model);
    const result = await runner.send({
      type: 'start_session',
      requestId: requestId(),
      sessionId: session.id,
      cwd: session.cwd,
      ...(parsed ? { model: { provider: parsed.provider, id: parsed.modelId } } : {}),
      ...(session.thinkingLevel ? { thinkingLevel: session.thinkingLevel } : {}),
      history: toRunnerHistory(session.messages),
    });
    if (!result.ok) throw new Error(result.error ?? 'Failed to start Pi runner session');
  }

  function finalizeAssistant(sessionId: string, aborted: boolean, messageId: string): void {
    const active = activeTurns.get(sessionId);
    if (active && (active.assistantContent.length > 0 || aborted)) {
      sessionStore.addMessage(sessionId, {
        role: 'assistant',
        content: active.assistantContent,
        messageId,
      });
    }
    activeTurns.set(sessionId, { assistantMessageId: null, assistantContent: '' });
    sessionStore.updateSession(sessionId, { status: 'idle' });
  }

  function handleRunnerEvent(event: RunnerEvent): void {
    switch (event.type) {
      case 'session_active':
        cacheModels(event.sessionId, event.availableModels);
        sessionStore.updateSession(event.sessionId, {
          cwd: event.cwd,
          ...(event.model ? { model: modelKey({ provider: event.model.provider, id: event.model.id }) } : {}),
          ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
        });
        break;
      case 'session_metadata_update':
        cacheModels(event.sessionId, event.availableModels);
        sessionStore.updateSession(event.sessionId, {
          ...(event.model ? { model: modelKey({ provider: event.model.provider, id: event.model.id }) } : {}),
          ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
        });
        break;
      case 'model_set_result':
        if (event.ok && event.model) {
          sessionStore.updateSession(event.sessionId, { model: modelKey({ provider: event.model.provider, id: event.model.id }) });
        }
        if (!event.ok) {
          emit(sseManager, {
            type: 'error',
            sessionId: event.sessionId,
            message: event.error ?? 'Failed to set model',
            category: 'runner',
            recoverable: true,
            timestamp: now(),
          });
        }
        break;
      case 'text': {
        const active = activeTurns.get(event.sessionId) ?? { assistantMessageId: event.messageId, assistantContent: '' };
        active.assistantMessageId = event.messageId;
        active.assistantContent += event.delta;
        activeTurns.set(event.sessionId, active);
        emit(sseManager, {
          type: 'text_chunk',
          sessionId: event.sessionId,
          messageId: event.messageId,
          content: event.delta,
          timestamp: now(),
        });
        break;
      }
      case 'thinking':
        emit(sseManager, {
          type: 'thinking',
          sessionId: event.sessionId,
          messageId: event.messageId,
          content: event.delta,
          done: false,
          timestamp: now(),
        });
        break;
      case 'tool_call':
        sessionStore.addMessage(event.sessionId, {
          role: 'tool_call',
          content: stringifyResult(event.input),
          messageId: event.messageId,
          toolName: event.toolName,
          toolCallId: event.toolCallId,
        });
        emit(sseManager, {
          type: 'tool_call',
          sessionId: event.sessionId,
          messageId: event.messageId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input && typeof event.input === 'object' ? event.input as Record<string, unknown> : { value: event.input },
          timestamp: now(),
        });
        break;
      case 'tool_result':
        sessionStore.addMessage(event.sessionId, {
          role: 'tool_result',
          content: stringifyResult(event.output),
          messageId: event.messageId,
          toolCallId: event.toolCallId,
          success: event.success ?? true,
        });
        emit(sseManager, {
          type: 'tool_result',
          sessionId: event.sessionId,
          messageId: event.messageId,
          toolCallId: event.toolCallId,
          result: stringifyResult(event.output),
          success: event.success ?? true,
          timestamp: now(),
        });
        break;
      case 'done':
        finalizeAssistant(event.sessionId, event.aborted ?? false, event.messageId);
        emit(sseManager, {
          type: 'done',
          sessionId: event.sessionId,
          messageId: event.messageId,
          aborted: event.aborted ?? false,
          timestamp: now(),
        });
        break;
      case 'question_resolved':
        sessionStore.updateSession(event.sessionId, { status: 'busy' });
        emit(sseManager, {
          type: 'status',
          sessionId: event.sessionId,
          status: 'busy',
          message: 'Question answered',
          metadata: { resolvedQuestionId: event.questionId },
          timestamp: now(),
        });
        break;
      case 'session_name': {
        const title = event.sessionName.trim();
        if (!title) break;
        sessionStore.updateSession(event.sessionId, { title });
        emit(sseManager, {
          type: 'status',
          sessionId: event.sessionId,
          status: 'busy',
          message: 'Session renamed',
          metadata: { sessionName: title },
          timestamp: now(),
        });
        break;
      }
      case 'error':
        emit(sseManager, {
          type: 'error',
          sessionId: event.sessionId ?? 'runner',
          message: event.message ?? event.error,
          category: 'runner',
          recoverable: !event.fatal,
          timestamp: now(),
        });
        break;
      default:
        break;
    }
  }

  async function listModels(sessionIdOrKey?: string): Promise<ModelSummary[]> {
    const session = sessionIdOrKey ? sessionStore.getSession(sessionIdOrKey) : undefined;
    const sessionId = session?.id;

    const result = await runner.send(sessionId
      ? { type: 'get_capabilities', requestId: requestId(), sessionId }
      : { type: 'get_capabilities', requestId: requestId() });

    if (result.ok && result.data && typeof result.data === 'object') {
      const models = (result.data as { availableModels?: RunnerModelInfo[] }).availableModels ?? [];
      cacheModels(sessionId, models);
    }

    const modelsSource = sessionId
      ? (availableModelsBySession.get(sessionId) ?? globalAvailableModels)
      : globalAvailableModels;
    const models = modelsSource.map(toModelLike);
    const availableKeys = new Set(models.map((model) => modelKey(model)));
    const selectedKey = selectedKeyFor(sessionIdOrKey) ?? session?.model;
    return selectedKey
      ? summarizeModels({ models, availableKeys, selectedKey })
      : summarizeModels({ models, availableKeys });
  }

  async function prompt(request: PromptRequest): Promise<PromptResult> {
    const sessionId = request.sessionId ?? config.generateSessionId();
    const cwd = request.cwd ?? config.piCwd;
    const session = ensureStoredSession(sessionId, cwd, request.model);
    const messageId = request.messageId ?? config.generateSessionId();

    if (request.model) sessionStore.updateSession(session.id, { model: request.model });
    if (request.thinkingLevel) sessionStore.updateSession(session.id, { thinkingLevel: request.thinkingLevel });
    sessionStore.updateSession(session.id, { status: 'busy', cwd });
    sessionStore.addMessage(session.id, { role: 'user', content: request.message, messageId });
    activeTurns.set(session.id, { assistantMessageId: messageId, assistantContent: '' });

    await startSessionIfNeeded(sessionStore.getSession(session.id) ?? session);
    if (request.thinkingLevel) await setThinkingLevel(session.id, request.thinkingLevel);
    const result = await runner.send({
      type: 'send_input',
      requestId: requestId(),
      sessionId: session.id,
      text: request.message,
      messageId,
    });
    if (!result.ok) throw new Error(result.error ?? 'Pi runner prompt failed');

    return {
      sessionId: session.id,
      assistantMessage: sessionStore.getSession(session.id)?.messages.at(-1)?.content ?? '',
    };
  }

  async function abort(sessionId: string): Promise<void> {
    const result = await runner.send({ type: 'abort', requestId: requestId(), sessionId });
    if (!result.ok) throw new Error(result.error ?? 'Pi runner abort failed');
  }

  async function answerQuestion(sessionId: string, questionId: string, answer: string): Promise<void> {
    const result = await runner.send({ type: 'answer_question', requestId: requestId(), sessionId, questionId, answer });
    if (!result.ok) throw new Error(result.error ?? 'Pi runner question answer failed');
    sessionStore.updateSession(sessionId, { status: 'busy' });
  }

  async function setModel(sessionId: string, modelKeyInput: string): Promise<void> {
    const session = sessionStore.getSession(sessionId);
    if (!session) return;
    await startSessionIfNeeded(session);
    const parsed = parseModelKey(modelKeyInput);
    if (!parsed) throw new Error(`Invalid model key: ${modelKeyInput}`);
    const result = await runner.send({
      type: 'set_model',
      requestId: requestId(),
      sessionId,
      model: { provider: parsed.provider, id: parsed.modelId },
    });
    if (!result.ok) throw new Error(result.error ?? 'Pi runner model switch failed');
  }

  async function setThinkingLevel(sessionId: string, thinkingLevel: ThinkingLevel): Promise<void> {
    const session = sessionStore.getSession(sessionId);
    if (!session) return;
    await startSessionIfNeeded(session);
    const result = await runner.send({ type: 'set_thinking_level', requestId: requestId(), sessionId, level: thinkingLevel });
    if (!result.ok) throw new Error(result.error ?? 'Pi runner thinking-level change failed');
    sessionStore.updateSession(sessionId, { thinkingLevel });
  }

  async function getThinkingLevels(sessionId: string): Promise<{ currentLevel: ThinkingLevel | undefined; availableLevels: ThinkingLevel[] }> {
    const session = sessionStore.getSession(sessionId);
    return { currentLevel: session?.thinkingLevel, availableLevels: THINKING_LEVELS };
  }

  async function dispose(): Promise<void> {
    await runner.stop();
  }

  return { listModels, prompt, abort, answerQuestion, setModel, setThinkingLevel, getThinkingLevels, dispose };
}
