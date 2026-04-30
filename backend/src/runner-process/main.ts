import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RunnerCommandSchema, type RunnerCommand, type RunnerEvent, type RunnerModelRef } from '../runner/protocol.js';

interface RpcClientOptions {
  cliPath?: string;
  cwd?: string;
  env?: Record<string, string>;
  model?: string;
  args?: string[];
}

interface OfficialRpcClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(listener: (event: unknown) => void): () => void;
  prompt(message: string): Promise<void>;
  steer(message: string): Promise<void>;
  followUp(message: string): Promise<void>;
  abort(): Promise<void>;
  getState(): Promise<unknown>;
  getAvailableModels(): Promise<unknown[]>;
  getSessionStats(): Promise<unknown>;
  setModel(provider: string, modelId: string): Promise<unknown>;
  setThinkingLevel(level: string): Promise<void>;
  getStderr(): string;
}

type RpcClientCtor = new (options?: RpcClientOptions) => OfficialRpcClient;

interface RpcSession {
  sessionId: string;
  cwd: string;
  client: OfficialRpcClient;
  unsubscribe: (() => void) | null;
  assistantMessageId: string | null;
  aborted: boolean;
  model: RunnerModelRef | null;
  thinkingLevel?: string;
  suppressExitError?: boolean;
}

const sessions = new Map<string, RpcSession>();
const runnerId = crypto.randomUUID();
let rpcClientCtorPromise: Promise<{ RpcClient: RpcClientCtor; cliPath: string }> | null = null;

function emit(event: RunnerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function commandResult(requestId: string, ok: boolean, data?: unknown, error?: string): void {
  emit({ type: 'command_result', requestId, ok, ...(data !== undefined ? { data } : {}), ...(error !== undefined ? { error } : {}) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

async function loadOfficialRpcClient(): Promise<{ RpcClient: RpcClientCtor; cliPath: string }> {
  if (rpcClientCtorPromise) return rpcClientCtorPromise;

  rpcClientCtorPromise = (async () => {
    const packageDir = path.resolve(process.cwd(), 'node_modules', '@mariozechner', 'pi-coding-agent');
    const modulePath = path.join(packageDir, 'dist', 'modes', 'rpc', 'rpc-client.js');
    const cliPath = process.env.PI_WEB_PI_CLI_PATH || path.join(packageDir, 'dist', 'cli.js');
    const module = await import(pathToFileURL(modulePath).href) as { RpcClient?: RpcClientCtor };
    if (!module.RpcClient) {
      throw new Error('Official Pi RpcClient export not found');
    }
    return { RpcClient: module.RpcClient, cliPath };
  })();

  return rpcClientCtorPromise;
}

function modelFromUnknown(value: unknown): RunnerModelRef | null {
  if (!isRecord(value)) return null;
  const provider = typeof value.provider === 'string' ? value.provider : undefined;
  const id = typeof value.id === 'string' ? value.id : typeof value.modelId === 'string' ? value.modelId : undefined;
  return provider && id ? { provider, id } : null;
}

function modelsFromUnknown(value: unknown): Array<RunnerModelRef & { name?: string; reasoning?: boolean; contextWindow?: number; maxTokens?: number }> {
  const raw = isRecord(value) && Array.isArray(value.models) ? value.models : Array.isArray(value) ? value : [];
  return raw.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const provider = typeof entry.provider === 'string' ? entry.provider : '';
    const id = typeof entry.id === 'string' ? entry.id : typeof entry.modelId === 'string' ? entry.modelId : '';
    if (!provider || !id) return [];
    return [{
      provider,
      id,
      ...(typeof entry.name === 'string' ? { name: entry.name } : {}),
      ...(typeof entry.reasoning === 'boolean' ? { reasoning: entry.reasoning } : {}),
      ...(typeof entry.contextWindow === 'number' ? { contextWindow: entry.contextWindow } : {}),
      ...(typeof entry.maxTokens === 'number' ? { maxTokens: entry.maxTokens } : {}),
    }];
  });
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractText).join('').trim();
  if (isRecord(value)) {
    for (const key of ['text', 'content', 'delta', 'refusal', 'thinking']) {
      if (typeof value[key] === 'string') return value[key];
    }
  }
  return '';
}

function extractSessionName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (isRecord(value)) {
    for (const key of ['sessionName', 'name', 'title']) {
      const raw = value[key];
      if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw.trim();
      }
    }
  }

  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function extractUsageMetadata(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const source = isRecord(value.usage) ? value.usage : isRecord(value.metrics) ? value.metrics : isRecord(value.context) ? value.context : value;
  const contextUsage = isRecord(value.contextUsage) ? value.contextUsage : isRecord(source.contextUsage) ? source.contextUsage : undefined;
  const tokenSource = isRecord(value.tokens) ? value.tokens : isRecord(source.tokens) ? source.tokens : source;
  const inputTokens = pickNumber(tokenSource, ['inputTokens', 'promptTokens', 'input_tokens', 'prompt_tokens', 'input']);
  const outputTokens = pickNumber(tokenSource, ['outputTokens', 'completionTokens', 'output_tokens', 'completion_tokens', 'output']);
  const cacheReadTokens = pickNumber(tokenSource, ['cacheRead', 'cache_read']);
  const cacheWriteTokens = pickNumber(tokenSource, ['cacheWrite', 'cache_write']);
  const totalTokens = pickNumber(tokenSource, ['totalTokens', 'tokens', 'total_tokens', 'total']);
  const cost = pickNumber(source, ['cost', 'totalCost', 'total_cost']);
  const contextWindow = contextUsage ? pickNumber(contextUsage, ['contextWindow', 'context_window', 'maxContextTokens']) : pickNumber(source, ['contextWindow', 'context_window', 'maxContextTokens']);
  const contextUsed = contextUsage ? pickNumber(contextUsage, ['tokens', 'contextUsed', 'contextTokens', 'context_used', 'usedTokens']) : pickNumber(source, ['contextUsed', 'contextTokens', 'context_used', 'usedTokens']);
  const contextPercent = contextUsage ? pickNumber(contextUsage, ['percent', 'contextPercent', 'contextPercentage', 'context_percent']) : pickNumber(source, ['contextPercent', 'contextPercentage', 'context_percent']);
  const metadata: Record<string, unknown> = {};
  if (inputTokens !== undefined) metadata.inputTokens = inputTokens;
  if (outputTokens !== undefined) metadata.outputTokens = outputTokens;
  if (cacheReadTokens !== undefined) metadata.cacheReadTokens = cacheReadTokens;
  if (cacheWriteTokens !== undefined) metadata.cacheWriteTokens = cacheWriteTokens;
  if (totalTokens !== undefined) metadata.totalTokens = totalTokens;
  if (cost !== undefined) metadata.cost = cost;
  if (contextWindow !== undefined) metadata.contextWindow = contextWindow;
  if (contextUsed !== undefined) metadata.contextUsed = contextUsed;
  if (contextPercent !== undefined) metadata.contextPercent = contextPercent;
  return Object.keys(metadata).length > 0 ? metadata : null;
}

async function emitSessionStats(active: RpcSession, status = 'idle'): Promise<void> {
  try {
    const [stats, state] = await Promise.all([
      active.client.getSessionStats().catch(() => null),
      active.client.getState().catch(() => null),
    ]);

    const statsMetadata = extractUsageMetadata(stats);
    const stateMetadata = extractUsageMetadata(state);
    const metadata: Record<string, unknown> = {
      ...(statsMetadata ?? {}),
      ...(stateMetadata ?? {}),
    };

    if (isRecord(state) && typeof state.autoCompactionEnabled === 'boolean') {
      metadata.autoCompactionEnabled = state.autoCompactionEnabled;
    }

    if (Object.keys(metadata).length > 0) {
      emit({ type: 'status', sessionId: active.sessionId, status, message: 'Context usage updated', metadata });
    }
  } catch {
    // Session stats are best-effort; streaming should never fail because of them.
  }
}

function extractErrorMessage(value: unknown): string {
  if (typeof value === 'string') return value;

  if (isRecord(value)) {
    for (const key of ['message', 'error', 'reason', 'description']) {
      const nested = value[key];
      if (typeof nested === 'string' && nested.trim().length > 0) return nested;
    }

    for (const key of ['error', 'cause', 'details']) {
      if (value[key] !== undefined) {
        const nestedMessage = extractErrorMessage(value[key]);
        if (nestedMessage.trim().length > 0) return nestedMessage;
      }
    }
  }

  return extractText(value).trim();
}

function completeTurn(active: RpcSession): void {
  if (!active.assistantMessageId) return;
  emit({ type: 'done', sessionId: active.sessionId, messageId: active.assistantMessageId, aborted: active.aborted });
  active.assistantMessageId = null;
  active.aborted = false;
}

function handleRpcEvent(active: RpcSession, event: Record<string, unknown>): void {
  const type = typeof event.type === 'string' ? event.type : '';

  const usageMetadata = extractUsageMetadata(event);
  if (usageMetadata) {
    emit({ type: 'status', sessionId: active.sessionId, status: 'busy', message: 'Usage updated', metadata: usageMetadata });
  }

  if (type === 'session_active' || type === 'session_metadata_update') {
    const state = isRecord(event.state) ? event.state : isRecord(event.metadata) ? event.metadata : event;
    const sessionName = extractSessionName(state.sessionName) ?? extractSessionName(event.sessionName);
    if (sessionName) emit({ type: 'session_name', sessionId: active.sessionId, sessionName, timestamp: new Date().toISOString() });
    const stateUsageMetadata = extractUsageMetadata(state);
    if (stateUsageMetadata) emit({ type: 'status', sessionId: active.sessionId, status: 'busy', message: 'Usage updated', metadata: stateUsageMetadata });
    return;
  }

  if (type === 'message_start') {
    const message = isRecord(event.message) ? event.message : undefined;
    if (isRecord(message) && message.role === 'assistant' && !active.assistantMessageId) active.assistantMessageId = crypto.randomUUID();
    return;
  }

  if (type === 'message_update') {
    if (!active.assistantMessageId) active.assistantMessageId = crypto.randomUUID();
    const update = isRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : {};
    const updateType = typeof update.type === 'string' ? update.type : '';
    if (updateType === 'text_delta') {
      emit({ type: 'text', sessionId: active.sessionId, messageId: active.assistantMessageId, delta: typeof update.delta === 'string' ? update.delta : '' });
    } else if (updateType === 'thinking_delta') {
      emit({ type: 'thinking', sessionId: active.sessionId, messageId: active.assistantMessageId, delta: typeof update.delta === 'string' ? update.delta : '' });
    } else if (updateType === 'toolcall_end' && isRecord(update.toolCall)) {
      const toolCall = update.toolCall;
      const toolName = typeof toolCall.name === 'string' ? toolCall.name : 'tool';
      if (toolName === 'set_session_name') return;
      emit({
        type: 'tool_call',
        sessionId: active.sessionId,
        messageId: active.assistantMessageId,
        toolCallId: typeof toolCall.id === 'string' ? toolCall.id : crypto.randomUUID(),
        toolName,
        input: toolCall.input ?? toolCall.args ?? {},
      });
    }
    return;
  }

  if (type === 'tool_execution_start') {
    const toolName = typeof event.toolName === 'string' ? event.toolName : 'tool';
    if (toolName === 'set_session_name') return;
    if (!active.assistantMessageId) active.assistantMessageId = crypto.randomUUID();
    emit({
      type: 'tool_call',
      sessionId: active.sessionId,
      messageId: active.assistantMessageId,
      toolCallId: typeof event.toolCallId === 'string' ? event.toolCallId : crypto.randomUUID(),
      toolName,
      input: event.args ?? {},
    });
    return;
  }

  if (type === 'tool_execution_update' || type === 'tool_execution_end') {
    const toolName = typeof event.toolName === 'string' ? event.toolName : 'tool';
    if (toolName === 'set_session_name') {
      const payload = type === 'tool_execution_update' ? event.partialResult : event.result;
      const sessionName = extractSessionName(payload) ?? extractSessionName(event.args);
      if (sessionName) emit({ type: 'session_name', sessionId: active.sessionId, sessionName, timestamp: new Date().toISOString() });
      return;
    }

    if (!active.assistantMessageId) active.assistantMessageId = crypto.randomUUID();
    emit({
      type: 'tool_result',
      sessionId: active.sessionId,
      messageId: active.assistantMessageId,
      toolCallId: typeof event.toolCallId === 'string' ? event.toolCallId : crypto.randomUUID(),
      output: type === 'tool_execution_update' ? event.partialResult : event.result,
      success: type === 'tool_execution_end' ? event.isError !== true : true,
    });
    return;
  }

  if (type === 'error' || type === 'agent_error' || type === 'fatal_error') {
    const message = extractErrorMessage(event.error ?? event.message ?? event.details ?? event) || 'Unknown Pi error';
    emit({ type: 'error', sessionId: active.sessionId, message, error: message, fatal: type === 'fatal_error' || event.fatal === true });
    return;
  }

  if (type === 'question') {
    const questionId = typeof event.questionId === 'string' ? event.questionId : crypto.randomUUID();
    emit({ type: 'error', sessionId: active.sessionId, error: extractText(event.question ?? event.message) || 'Question event received without supported RPC answer protocol', message: extractText(event.question ?? event.message), fatal: false });
    emit({ type: 'question_resolved', sessionId: active.sessionId, questionId });
    return;
  }

  if (type === 'agent_end') {
    completeTurn(active);
    void emitSessionStats(active, 'idle');
  }
}

async function spawnRpcSession(sessionId: string, cwd: string, resumeSession?: string): Promise<RpcSession> {
  const { RpcClient, cliPath } = await loadOfficialRpcClient();
  const args = resumeSession ? ['--session', resumeSession] : [];
  const client = new RpcClient({
    cliPath,
    cwd: path.resolve(cwd),
    env: process.env as Record<string, string>,
    args,
  });
  const active: RpcSession = { sessionId, cwd, client, unsubscribe: null, assistantMessageId: null, aborted: false, model: null };
  active.unsubscribe = client.onEvent((event) => handleRpcEvent(active, isRecord(event) ? event : { type: 'unknown' }));
  await client.start();
  sessions.set(sessionId, active);
  return active;
}

async function ensureSession(command: Extract<RunnerCommand, { type: 'start_session' }>): Promise<RpcSession> {
  const existing = sessions.get(command.sessionId);
  if (existing) return existing;
  return spawnRpcSession(command.sessionId, command.cwd, command.piSessionFile ?? command.piSessionId);
}

async function emitSessionActive(active: RpcSession): Promise<void> {
  const [state, models] = await Promise.all([
    active.client.getState().catch(() => null),
    active.client.getAvailableModels().catch(() => []),
  ]);
  const data = isRecord(state) ? state : {};
  active.model = modelFromUnknown(data.model) ?? active.model;
  if (typeof data.thinkingLevel === 'string' && data.thinkingLevel !== 'off') {
    active.thinkingLevel = data.thinkingLevel;
  }
  emit({
    type: 'session_active',
    sessionId: active.sessionId,
    cwd: active.cwd,
    model: active.model,
    ...(active.thinkingLevel ? { thinkingLevel: active.thinkingLevel as never } : {}),
    availableModels: modelsFromUnknown(models),
    ...(typeof data.sessionId === 'string' ? { piSessionId: data.sessionId } : {}),
    ...(typeof data.sessionFile === 'string' ? { piSessionFile: data.sessionFile } : {}),
  });
}

function sameModel(left: RunnerModelRef | null | undefined, right: RunnerModelRef | null | undefined): boolean {
  return !!left && !!right && left.provider === right.provider && left.id === right.id;
}

async function handleCommand(command: RunnerCommand): Promise<void> {
  switch (command.type) {
    case 'start_session': {
      const alreadyStarted = sessions.has(command.sessionId);
      const active = await ensureSession(command);
      const requestedModel = command.model;
      const requestedThinkingLevel = command.thinkingLevel;
      const modelChanged = !!requestedModel && !sameModel(active.model, requestedModel);
      const thinkingChanged = !!requestedThinkingLevel && active.thinkingLevel !== requestedThinkingLevel;
      if (modelChanged) {
        await active.client.setModel(requestedModel.provider, requestedModel.id);
        active.model = requestedModel;
      }
      if (thinkingChanged) {
        await active.client.setThinkingLevel(requestedThinkingLevel);
        active.thinkingLevel = requestedThinkingLevel;
      }
      if (!alreadyStarted || modelChanged || thinkingChanged) await emitSessionActive(active);
      void emitSessionStats(active, 'idle');
      commandResult(command.requestId, true, { sessionId: command.sessionId });
      break;
    }
    case 'send_input': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      active.assistantMessageId = command.messageId ?? crypto.randomUUID();
      active.aborted = false;
      commandResult(command.requestId, true, { sessionId: command.sessionId });
      const send = command.deliverAs === 'steer'
        ? active.client.steer(command.text)
        : command.deliverAs === 'followUp'
          ? active.client.followUp(command.text)
          : active.client.prompt(command.text);
      void send.catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        emit({ type: 'error', sessionId: active.sessionId, error: message, message, fatal: false });
        completeTurn(active);
      });
      break;
    }
    case 'answer_question': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      active.assistantMessageId = crypto.randomUUID();
      active.aborted = false;
      await active.client.prompt(command.answer);
      emit({ type: 'question_resolved', sessionId: command.sessionId, questionId: command.questionId });
      commandResult(command.requestId, true, { sessionId: command.sessionId, questionId: command.questionId });
      break;
    }
    case 'set_model': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      await active.client.setModel(command.model.provider, command.model.id);
      active.model = command.model;
      emit({ type: 'model_set_result', sessionId: command.sessionId, requestId: command.requestId, ok: true, model: command.model });
      await emitSessionActive(active);
      commandResult(command.requestId, true, { model: command.model });
      break;
    }
    case 'set_thinking_level': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      await active.client.setThinkingLevel(command.level);
      active.thinkingLevel = command.level;
      await emitSessionActive(active);
      commandResult(command.requestId, true, { thinkingLevel: command.level });
      break;
    }
    case 'abort': {
      const active = sessions.get(command.sessionId);
      if (active) {
        active.aborted = true;
        await active.client.abort().catch(() => undefined);
        completeTurn(active);
      }
      commandResult(command.requestId, true);
      break;
    }
    case 'get_capabilities': {
      const active = command.sessionId ? sessions.get(command.sessionId) : undefined;
      if (active) {
        const response = await active.client.getAvailableModels();
        commandResult(command.requestId, true, { model: active.model, availableModels: modelsFromUnknown(response) });
      } else {
        const probe = await spawnRpcSession(`capabilities-${crypto.randomUUID()}`, process.cwd());
        probe.suppressExitError = true;
        try {
          const response = await probe.client.getAvailableModels();
          commandResult(command.requestId, true, { model: null, availableModels: modelsFromUnknown(response) });
        } finally {
          probe.unsubscribe?.();
          await probe.client.stop().catch(() => undefined);
          sessions.delete(probe.sessionId);
        }
      }
      break;
    }
    case 'shutdown': {
      commandResult(command.requestId, true);
      for (const active of sessions.values()) {
        active.unsubscribe?.();
        await active.client.stop().catch(() => undefined);
      }
      process.exit(0);
    }
  }
}

emit({ type: 'ready', runnerId, pid: process.pid, version: '0.3.0-official-rpc-client' });

let stdinBuffer = '';
process.stdin.on('data', (chunk: Buffer) => {
  stdinBuffer += chunk.toString('utf8');
  for (;;) {
    const index = stdinBuffer.indexOf('\n');
    if (index < 0) break;
    const line = stdinBuffer.slice(0, index).replace(/\r$/, '');
    stdinBuffer = stdinBuffer.slice(index + 1);
    if (!line.trim()) continue;
    void (async () => {
      let requestId = 'unknown';
      try {
        const command = RunnerCommandSchema.parse(JSON.parse(line));
        requestId = command.requestId;
        await handleCommand(command);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        commandResult(requestId, false, undefined, message);
        emit({ type: 'error', error: message, fatal: false });
      }
    })();
  }
});
