import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { RunnerCommandSchema, type RunnerCommand, type RunnerEvent, type RunnerModelRef } from '../runner/protocol.js';

interface RpcResponse {
  type: 'response';
  id?: string;
  command?: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface RpcSession {
  sessionId: string;
  cwd: string;
  child: ChildProcessWithoutNullStreams;
  assistantMessageId: string | null;
  aborted: boolean;
  model: RunnerModelRef | null;
  thinkingLevel?: string;
  pending: Map<string, { resolve: (response: RpcResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>;
  buffer: string;
  suppressExitError?: boolean;
}

const sessions = new Map<string, RpcSession>();
const runnerId = crypto.randomUUID();
const piCommand = process.env.PI_WEB_PI_COMMAND || 'pi';

function emit(event: RunnerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function commandResult(requestId: string, ok: boolean, data?: unknown, error?: string): void {
  emit({ type: 'command_result', requestId, ok, ...(data !== undefined ? { data } : {}), ...(error !== undefined ? { error } : {}) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function modelFromUnknown(value: unknown): RunnerModelRef | null {
  if (!isRecord(value)) return null;
  const provider = typeof value.provider === 'string' ? value.provider : undefined;
  const id = typeof value.id === 'string' ? value.id : typeof value.modelId === 'string' ? value.modelId : undefined;
  return provider && id ? { provider, id } : null;
}

function modelsFromUnknown(value: unknown): Array<RunnerModelRef & { name?: string; reasoning?: boolean; contextWindow?: number }> {
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
    }];
  });
}

function nextRpcId(requestId: string): string {
  return `${requestId}:${crypto.randomUUID()}`;
}

function sendRpc(active: RpcSession, requestId: string, payload: Record<string, unknown>): Promise<RpcResponse> {
  const id = nextRpcId(requestId);
  const message = { id, ...payload };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      active.pending.delete(id);
      reject(new Error(`pi rpc command timed out: ${String(payload.type)}`));
    }, 120_000);
    active.pending.set(id, { resolve, reject, timer });
    active.child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error) {
        clearTimeout(timer);
        active.pending.delete(id);
        reject(error);
      }
    });
  });
}

function handleRpcResponse(active: RpcSession, response: RpcResponse): void {
  if (!response.id) return;
  const pending = active.pending.get(response.id);
  if (!pending) return;
  active.pending.delete(response.id);
  clearTimeout(pending.timer);
  if (response.success) pending.resolve(response);
  else pending.reject(new Error(response.error || `${response.command || 'rpc'} failed`));
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

function extractErrorMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (isRecord(value)) {
    for (const key of ['message', 'error', 'reason', 'description']) {
      const nested = value[key];
      if (typeof nested === 'string' && nested.trim().length > 0) {
        return nested;
      }
    }

    for (const key of ['error', 'cause', 'details']) {
      if (value[key] !== undefined) {
        const nestedMessage = extractErrorMessage(value[key]);
        if (nestedMessage.trim().length > 0) {
          return nestedMessage;
        }
      }
    }
  }

  const fallback = extractText(value).trim();
  return fallback;
}

function handleRpcEvent(active: RpcSession, event: Record<string, unknown>): void {
  const type = typeof event.type === 'string' ? event.type : '';
  if (type === 'response') {
    handleRpcResponse(active, event as unknown as RpcResponse);
    return;
  }

  if (type === 'session_active' || type === 'session_metadata_update') {
    const state = isRecord(event.state) ? event.state : isRecord(event.metadata) ? event.metadata : event;
    const sessionName = extractSessionName(state.sessionName) ?? extractSessionName(event.sessionName);
    if (sessionName) {
      emit({ type: 'session_name', sessionId: active.sessionId, sessionName, timestamp: new Date().toISOString() });
    }
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
      if (toolName === 'set_session_name') {
        return;
      }
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
    if (toolName === 'set_session_name') {
      return;
    }
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
      if (sessionName) {
        emit({ type: 'session_name', sessionId: active.sessionId, sessionName, timestamp: new Date().toISOString() });
      }
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
    emit({
      type: 'error',
      sessionId: active.sessionId,
      message,
      error: message,
      fatal: type === 'fatal_error' || event.fatal === true,
    });
    return;
  }

  if (type === 'question') {
    const questionId = typeof event.questionId === 'string' ? event.questionId : crypto.randomUUID();
    emit({ type: 'error', sessionId: active.sessionId, error: extractText(event.question ?? event.message) || 'Question event received without supported RPC answer protocol', message: extractText(event.question ?? event.message), fatal: false });
    emit({ type: 'question_resolved', sessionId: active.sessionId, questionId });
    return;
  }

  if (type === 'agent_end') {
    emit({ type: 'done', sessionId: active.sessionId, messageId: active.assistantMessageId ?? crypto.randomUUID(), aborted: active.aborted });
    active.assistantMessageId = null;
    active.aborted = false;
  }
}

function handleRpcChunk(active: RpcSession, chunk: Buffer): void {
  active.buffer += chunk.toString('utf8');
  for (;;) {
    const index = active.buffer.indexOf('\n');
    if (index < 0) break;
    const line = active.buffer.slice(0, index).replace(/\r$/, '');
    active.buffer = active.buffer.slice(index + 1);
    if (!line.trim()) continue;
    try {
      handleRpcEvent(active, JSON.parse(line) as Record<string, unknown>);
    } catch (error) {
      emit({ type: 'error', sessionId: active.sessionId, error: error instanceof Error ? error.message : String(error), fatal: false });
    }
  }
}

function spawnRpcSession(sessionId: string, cwd: string): RpcSession {
  const child = spawn(piCommand, ['--mode', 'rpc'], {
    cwd: path.resolve(cwd),
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const active: RpcSession = { sessionId, cwd, child, assistantMessageId: null, aborted: false, model: null, pending: new Map(), buffer: '' };
  child.stdout.on('data', (chunk: Buffer) => handleRpcChunk(active, chunk));
  child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  child.on('exit', (code, signal) => {
    for (const pending of active.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`pi rpc exited with code ${String(code)} signal ${String(signal)}`));
    }
    active.pending.clear();
    sessions.delete(sessionId);
    if (!active.suppressExitError) {
      emit({ type: 'error', sessionId, error: `pi rpc exited with code ${String(code)} signal ${String(signal)}`, fatal: false });
    }
  });
  sessions.set(sessionId, active);
  return active;
}

async function ensureSession(command: Extract<RunnerCommand, { type: 'start_session' }>): Promise<RpcSession> {
  return sessions.get(command.sessionId) ?? spawnRpcSession(command.sessionId, command.cwd);
}

async function emitSessionActive(active: RpcSession): Promise<void> {
  const [state, models] = await Promise.all([
    sendRpc(active, 'state', { type: 'get_state' }).catch(() => null),
    sendRpc(active, 'models', { type: 'get_available_models' }).catch(() => null),
  ]);
  const data = isRecord(state?.data) ? state.data : {};
  active.model = modelFromUnknown(data.model) ?? active.model;
  emit({
    type: 'session_active',
    sessionId: active.sessionId,
    cwd: active.cwd,
    model: active.model,
    thinkingLevel: typeof data.thinkingLevel === 'string' && data.thinkingLevel !== 'off' ? data.thinkingLevel as never : undefined,
    availableModels: modelsFromUnknown(models?.data),
  });
}

async function handleCommand(command: RunnerCommand): Promise<void> {
  switch (command.type) {
    case 'start_session': {
      const active = await ensureSession(command);
      if (command.model) await sendRpc(active, command.requestId, { type: 'set_model', provider: command.model.provider, modelId: command.model.id });
      if (command.thinkingLevel) await sendRpc(active, command.requestId, { type: 'set_thinking_level', level: command.thinkingLevel });
      await emitSessionActive(active);
      commandResult(command.requestId, true, { sessionId: command.sessionId });
      break;
    }
    case 'send_input': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      active.assistantMessageId = command.messageId ?? crypto.randomUUID();
      active.aborted = false;
      const rpcType = command.deliverAs === 'steer' ? 'steer' : command.deliverAs === 'followUp' ? 'follow_up' : 'prompt';
      await sendRpc(active, command.requestId, { type: rpcType, message: command.text });
      commandResult(command.requestId, true, { sessionId: command.sessionId });
      break;
    }
    case 'answer_question': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      active.assistantMessageId = crypto.randomUUID();
      active.aborted = false;
      await sendRpc(active, command.requestId, { type: 'prompt', message: command.answer });
      emit({ type: 'question_resolved', sessionId: command.sessionId, questionId: command.questionId });
      commandResult(command.requestId, true, { sessionId: command.sessionId, questionId: command.questionId });
      break;
    }
    case 'set_model': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      await sendRpc(active, command.requestId, { type: 'set_model', provider: command.model.provider, modelId: command.model.id });
      active.model = command.model;
      emit({ type: 'model_set_result', sessionId: command.sessionId, requestId: command.requestId, ok: true, model: command.model });
      await emitSessionActive(active);
      commandResult(command.requestId, true, { model: command.model });
      break;
    }
    case 'set_thinking_level': {
      const active = sessions.get(command.sessionId);
      if (!active) throw new Error(`Session ${command.sessionId} has not been started`);
      await sendRpc(active, command.requestId, { type: 'set_thinking_level', level: command.level });
      await emitSessionActive(active);
      commandResult(command.requestId, true, { thinkingLevel: command.level });
      break;
    }
    case 'abort': {
      const active = sessions.get(command.sessionId);
      if (active) {
        active.aborted = true;
        await sendRpc(active, command.requestId, { type: 'abort' }).catch(() => undefined);
      }
      commandResult(command.requestId, true);
      break;
    }
    case 'get_capabilities': {
      const active = command.sessionId ? sessions.get(command.sessionId) : undefined;
      if (active) {
        const response = await sendRpc(active, command.requestId, { type: 'get_available_models' });
        commandResult(command.requestId, true, { model: active.model, availableModels: modelsFromUnknown(response.data) });
      } else {
        const probe = spawnRpcSession(`capabilities-${crypto.randomUUID()}`, process.cwd());
        probe.suppressExitError = true;
        const response = await sendRpc(probe, command.requestId, { type: 'get_available_models' });
        probe.child.kill('SIGTERM');
        commandResult(command.requestId, true, { model: null, availableModels: modelsFromUnknown(response.data) });
      }
      break;
    }
    case 'shutdown': {
      commandResult(command.requestId, true);
      for (const active of sessions.values()) active.child.kill('SIGTERM');
      process.exit(0);
    }
  }
}

emit({ type: 'ready', runnerId, pid: process.pid, version: '0.2.0-rpc' });

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
