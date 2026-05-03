import type { Config } from '../config/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { THINKING_LEVELS, type ThinkingLevel } from '../types/thinking.js';
import { modelKey, parseModelKey, summarizeModels, type ModelLike, type ModelSummary } from '../models/resolver.js';
import { getHiddenModelKeysFromEnv, isHiddenModelKey } from '../models/visibility.js';
import type { Session, SessionImageAttachment, SessionStore } from '../sessions/store.js';
import type { SseManager } from '../sse/manager.js';
import type { SseEvent } from '../events.js';
import { RunnerProcessClient } from './child-process.js';
import type { RunnerEvent, RunnerModelInfo } from './protocol.js';

export interface PromptRequest {
  sessionId?: string;
  cwd?: string;
  message: string;
  displayMessage?: string;
  attachments?: SessionImageAttachment[];
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
  userMessageId: string;
  assistantMessageId: string;
  assistantContent: string;
  assistantAnnounced?: boolean;
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

function deriveFallbackSessionTitle(message: string): string {
  const normalized = message
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 'New session';

  const words = normalized.split(' ').slice(0, 7).join(' ');
  const title = words.length < normalized.length ? `${words}…` : words;
  return title.length > 80 ? `${title.slice(0, 77).trim()}…` : title;
}

function readEnabledModelKeys(homeDir: string): string[] {
  const settingsPath = path.join(homeDir, '.pi', 'agent', 'settings.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { enabledModels?: unknown }).enabledModels)) {
      return [];
    }
    return (parsed as { enabledModels: unknown[] }).enabledModels
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeModelKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.includes('/')) return trimmed.toLowerCase();
  const dot = trimmed.indexOf('.');
  if (dot > 0 && dot < trimmed.length - 1) {
    return `${trimmed.slice(0, dot)}/${trimmed.slice(dot + 1)}`.toLowerCase();
  }
  return trimmed.toLowerCase();
}

function applyModelVisibility(models: RunnerModelInfo[], hiddenModelKeys: Set<string>, enabledModelKeys: string[]): RunnerModelInfo[] {
  const visibleModels = models.filter((model) => !isHiddenModelKey(modelKey(model), hiddenModelKeys));
  if (enabledModelKeys.length === 0) return visibleModels;

  const byKey = new Map(visibleModels.map((model) => [normalizeModelKey(modelKey(model)), model]));
  const enabledVisibleModels: RunnerModelInfo[] = [];

  for (const enabledKey of enabledModelKeys) {
    const normalized = normalizeModelKey(enabledKey);
    const existing = byKey.get(normalized);
    if (existing) {
      enabledVisibleModels.push(existing);
      continue;
    }

    const parsed = parseModelKey(normalized);
    if (!parsed) continue;

    enabledVisibleModels.push({
      provider: parsed.provider,
      id: parsed.modelId,
      name: parsed.modelId,
      reasoning: false,
      input: ['text'],
      contextWindow: 0,
      maxTokens: 0,
    });
  }

  return enabledVisibleModels.length > 0 ? enabledVisibleModels : visibleModels;
}

function toModelLike(model: RunnerModelInfo): ModelLike {
  return {
    provider: model.provider,
    id: model.id,
    ...(model.name !== undefined ? { name: model.name } : {}),
    ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
    ...(model.input !== undefined ? { input: model.input } : {}),
    ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
    ...(model.maxTokens !== undefined ? { maxTokens: model.maxTokens } : {}),
  };
}

function toSessionStatus(status: string): Session['status'] {
  switch (status) {
    case 'idle':
    case 'busy':
    case 'retry':
    case 'error':
    case 'prompting':
    case 'answering':
    case 'waiting_question':
    case 'waiting_permission':
    case 'paused':
    case 'done':
      return status;
    default:
      return 'busy';
  }
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
  const pendingToolStatus = new Map<string, number>();
  const capabilitiesFetchedAtBySession = new Map<string, number>();
  let globalCapabilitiesFetchedAt = 0;
  const CAPABILITIES_CACHE_TTL_MS = 30_000;

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
    const visibleModels = applyModelVisibility(models, hiddenModelKeys, readEnabledModelKeys(config.homeDir));
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
      ...(session.piSessionId ? { piSessionId: session.piSessionId } : {}),
      ...(session.piSessionFile ? { piSessionFile: session.piSessionFile } : {}),
      history: toRunnerHistory(session.messages),
    });
    if (!result.ok) throw new Error(result.error ?? 'Failed to start Pi runner session');
  }

  function resolveAssistantMessageId(sessionId: string, fallbackMessageId: string): string {
    const active = activeTurns.get(sessionId);
    if (active?.assistantMessageId) {
      return active.assistantMessageId;
    }
    return fallbackMessageId;
  }

  function announceAssistantMessage(sessionId: string, active: ActiveTurn): void {
    if (active.assistantAnnounced) return;
    active.assistantAnnounced = true;
    activeTurns.set(sessionId, active);
    emit(sseManager, {
      type: 'message_updated',
      sessionId,
      messageId: active.assistantMessageId,
      timestamp: now(),
    });
  }

  function getLatestPiAssistantError(sessionId: string): string | null {
    const session = sessionStore.getSession(sessionId);
    const piSessionFile = session?.piSessionFile;
    if (!piSessionFile) {
      return null;
    }

    try {
      const raw = fs.readFileSync(piSessionFile, 'utf8');
      const lines = raw.split('\n').filter((line) => line.trim().length > 0);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (!line) {
          continue;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (!parsed || typeof parsed !== 'object') {
          continue;
        }
        const candidate = parsed as {
          type?: unknown;
          message?: { role?: unknown; stopReason?: unknown; errorMessage?: unknown };
        };
        if (candidate.type !== 'message' || !candidate.message || typeof candidate.message !== 'object') {
          continue;
        }
        if (candidate.message.role !== 'assistant') {
          continue;
        }
        const stopReason = typeof candidate.message.stopReason === 'string' ? candidate.message.stopReason : '';
        const errorMessage = typeof candidate.message.errorMessage === 'string' ? candidate.message.errorMessage.trim() : '';
        if (stopReason === 'error' && errorMessage.length > 0) {
          return errorMessage;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  function finalizeAssistant(sessionId: string, aborted: boolean, messageId: string): string | null {
    const active = activeTurns.get(sessionId);
    const content = active?.assistantContent ?? '';
    let fallbackContent: string | null = null;

    if (content.length > 0 || aborted) {
      sessionStore.addMessage(sessionId, {
        role: 'assistant',
        content,
        messageId,
      });
    } else {
      const piError = getLatestPiAssistantError(sessionId);
      if (piError) {
        const fallback = `Model error: ${piError}`;
        sessionStore.addMessage(sessionId, {
          role: 'assistant',
          content: fallback,
          messageId,
        });
        fallbackContent = fallback;
      }
    }

    activeTurns.delete(sessionId);
    sessionStore.updateSession(sessionId, { status: 'idle' });
    return fallbackContent;
  }

  function handleRunnerEvent(event: RunnerEvent): void {
    switch (event.type) {
      case 'session_active':
        cacheModels(event.sessionId, event.availableModels);
        sessionStore.updateSession(event.sessionId, {
          cwd: event.cwd,
          ...(event.model ? { model: modelKey({ provider: event.model.provider, id: event.model.id }) } : {}),
          ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
          ...(event.piSessionId ? { piSessionId: event.piSessionId } : {}),
          ...(event.piSessionFile ? { piSessionFile: event.piSessionFile } : {}),
        });
        break;
      case 'session_metadata_update':
        cacheModels(event.sessionId, event.availableModels);
        sessionStore.updateSession(event.sessionId, {
          ...(event.model ? { model: modelKey({ provider: event.model.provider, id: event.model.id }) } : {}),
          ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
          ...(event.piSessionId ? { piSessionId: event.piSessionId } : {}),
          ...(event.piSessionFile ? { piSessionFile: event.piSessionFile } : {}),
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
          emit(sseManager, {
            type: 'status',
            sessionId: event.sessionId,
            status: 'idle',
            message: 'Model change failed',
            timestamp: now(),
          });
        }
        break;
      case 'status': {
        const updates: Parameters<typeof sessionStore.updateSession>[1] = {
          status: toSessionStatus(event.status),
          ...(event.message !== undefined ? { statusMessage: event.message } : {}),
          ...(event.metadata !== undefined ? { statusMetadata: event.metadata } : {}),
        };
        sessionStore.updateSession(event.sessionId, updates);
        emit(sseManager, {
          type: 'status',
          sessionId: event.sessionId,
          status: event.status,
          message: event.message,
          metadata: event.metadata,
          timestamp: now(),
        });
        break;
      }
      case 'text': {
        const assistantMessageId = resolveAssistantMessageId(event.sessionId, event.messageId);
        const active = activeTurns.get(event.sessionId) ?? {
          userMessageId: event.messageId,
          assistantMessageId,
          assistantContent: '',
        };
        announceAssistantMessage(event.sessionId, active);
        active.assistantContent += event.delta;
        activeTurns.set(event.sessionId, active);
        emit(sseManager, {
          type: 'text_chunk',
          sessionId: event.sessionId,
          messageId: assistantMessageId,
          content: event.delta,
          timestamp: now(),
        });
        break;
      }
      case 'thinking': {
        const assistantMessageId = resolveAssistantMessageId(event.sessionId, event.messageId);
        const active = activeTurns.get(event.sessionId) ?? {
          userMessageId: event.messageId,
          assistantMessageId,
          assistantContent: '',
        };
        announceAssistantMessage(event.sessionId, active);
        emit(sseManager, {
          type: 'thinking',
          sessionId: event.sessionId,
          messageId: assistantMessageId,
          content: event.delta,
          done: false,
          timestamp: now(),
        });
        break;
      }
      case 'tool_call': {
        const assistantMessageId = resolveAssistantMessageId(event.sessionId, event.messageId);
        const active = activeTurns.get(event.sessionId) ?? {
          userMessageId: event.messageId,
          assistantMessageId,
          assistantContent: '',
        };
        announceAssistantMessage(event.sessionId, active);
        sessionStore.addMessage(event.sessionId, {
          role: 'tool_call',
          content: stringifyResult(event.input),
          messageId: assistantMessageId,
          toolName: event.toolName,
          toolCallId: event.toolCallId,
        });
        emit(sseManager, {
          type: 'tool_call',
          sessionId: event.sessionId,
          messageId: assistantMessageId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input && typeof event.input === 'object' ? event.input as Record<string, unknown> : { value: event.input },
          timestamp: now(),
        });
        {
          const key = `${event.sessionId}:${event.toolCallId}`;
          const lastEmittedAt = pendingToolStatus.get(key) ?? 0;
          if (Date.now() - lastEmittedAt > 500) {
            pendingToolStatus.set(key, Date.now());
            emit(sseManager, {
              type: 'status',
              sessionId: event.sessionId,
              status: 'busy',
              message: `Running ${event.toolName}`,
              timestamp: now(),
            });
          }
        }
        break;
      }
      case 'tool_result': {
        const assistantMessageId = resolveAssistantMessageId(event.sessionId, event.messageId);
        sessionStore.addMessage(event.sessionId, {
          role: 'tool_result',
          content: stringifyResult(event.output),
          messageId: assistantMessageId,
          toolCallId: event.toolCallId,
          success: event.success ?? true,
        });
        emit(sseManager, {
          type: 'tool_result',
          sessionId: event.sessionId,
          messageId: assistantMessageId,
          toolCallId: event.toolCallId,
          result: stringifyResult(event.output),
          success: event.success ?? true,
          timestamp: now(),
        });
        break;
      }
      case 'done': {
        const assistantMessageId = resolveAssistantMessageId(event.sessionId, event.messageId);
        const fallbackContent = finalizeAssistant(event.sessionId, event.aborted ?? false, assistantMessageId);
        if (fallbackContent && fallbackContent.length > 0) {
          emit(sseManager, {
            type: 'text_chunk',
            sessionId: event.sessionId,
            messageId: assistantMessageId,
            content: fallbackContent,
            timestamp: now(),
          });
        }
        sessionStore.updateSession(event.sessionId, {
          status: 'idle',
          statusMessage: event.aborted ? 'CLI stopped' : 'CLI idle',
        });
        emit(sseManager, {
          type: 'done',
          sessionId: event.sessionId,
          messageId: assistantMessageId,
          aborted: event.aborted ?? false,
          timestamp: now(),
        });
        emit(sseManager, {
          type: 'status',
          sessionId: event.sessionId,
          status: 'idle',
          message: event.aborted ? 'CLI stopped' : 'CLI idle',
          timestamp: now(),
        });
        break;
      }
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
          type: 'session_name',
          sessionId: event.sessionId,
          sessionName: title,
          timestamp: now(),
        });
        break;
      }
      case 'error':
        if (event.sessionId) {
          sessionStore.updateSession(event.sessionId, { status: 'error' });
          activeTurns.delete(event.sessionId);
        }
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

    const cachedAt = sessionId ? (capabilitiesFetchedAtBySession.get(sessionId) ?? 0) : globalCapabilitiesFetchedAt;
    const hasUsableCache = sessionId
      ? Boolean(availableModelsBySession.get(sessionId)?.length || globalAvailableModels.length)
      : globalAvailableModels.length > 0;

    // Best effort: avoid spawning/probing Pi on every model-menu open. Use the
    // official RPC client only when the cache is cold/stale, then refresh cache.
    if (!hasUsableCache || Date.now() - cachedAt > CAPABILITIES_CACHE_TTL_MS) {
      let result;
      try {
        result = await runner.send(sessionId
          ? { type: 'get_capabilities', requestId: requestId(), sessionId }
          : { type: 'get_capabilities', requestId: requestId() });
      } catch {
        if (sessionId) {
          try {
            result = await runner.send({ type: 'get_capabilities', requestId: requestId() });
          } catch {
            result = undefined;
          }
        }
      }

      if (result?.ok && result.data && typeof result.data === 'object') {
        const models = (result.data as { availableModels?: RunnerModelInfo[] }).availableModels ?? [];
        cacheModels(sessionId, models);
        if (sessionId) capabilitiesFetchedAtBySession.set(sessionId, Date.now());
        else globalCapabilitiesFetchedAt = Date.now();
      }
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
    const assistantMessageId = `${messageId}_assistant`;

    if (request.model) sessionStore.updateSession(session.id, { model: request.model });
    if (request.thinkingLevel) sessionStore.updateSession(session.id, { thinkingLevel: request.thinkingLevel });

    const latestSession = sessionStore.getSession(session.id) ?? session;
    const shouldApplyFallbackTitle = !latestSession.title?.trim();
    const titleSource = latestSession.messages.find((message) => message.role === 'user' && message.content.trim().length > 0)?.content ?? request.message;
    const fallbackTitle = shouldApplyFallbackTitle ? deriveFallbackSessionTitle(titleSource) : '';

    sessionStore.updateSession(session.id, {
      status: 'busy',
      cwd,
      ...(fallbackTitle ? { title: fallbackTitle } : {}),
    });
    if (fallbackTitle) {
      emit(sseManager, {
        type: 'session_name',
        sessionId: session.id,
        sessionName: fallbackTitle,
        timestamp: now(),
      });
    }
    sessionStore.addMessage(session.id, {
      role: 'user',
      content: request.displayMessage ?? request.message,
      messageId,
      ...(request.attachments && request.attachments.length > 0 ? { attachments: request.attachments } : {}),
    });
    emit(sseManager, {
      type: 'message_updated',
      sessionId: session.id,
      messageId,
      timestamp: now(),
    });
    const activeTurn: ActiveTurn = {
      userMessageId: messageId,
      assistantMessageId,
      assistantContent: '',
    };
    activeTurns.set(session.id, activeTurn);
    announceAssistantMessage(session.id, activeTurn);
    emit(sseManager, {
      type: 'status',
      sessionId: session.id,
      status: 'busy',
      message: 'Working',
      timestamp: now(),
    });

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
    capabilitiesFetchedAtBySession.delete(sessionId);
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
