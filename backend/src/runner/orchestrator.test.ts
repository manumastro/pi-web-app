import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionStore } from '../sessions/store.js';
import type { SseEvent } from '../sdk/events.js';
import type { SseManager } from '../sse/manager.js';
import { RunnerProcessClient } from './child-process.js';
import { createRunnerOrchestrator, type RunnerOrchestrator } from './orchestrator.js';

async function writeFakeRunner(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-orchestrator-test-'));
  const file = path.join(dir, 'runner.mjs');
  await fs.writeFile(file, `
    import readline from 'node:readline';
    const rl = readline.createInterface({ input: process.stdin });
    const currentModels = new Map();
    const out = event => console.log(JSON.stringify(event));
    out({ type: 'ready', runnerId: 'fake', pid: process.pid, version: 'test' });
    rl.on('line', line => {
      const command = JSON.parse(line);
      if (command.type === 'shutdown') {
        out({ type: 'command_result', requestId: command.requestId, ok: true });
        process.exit(0);
      }
      if (command.type === 'get_capabilities') {
        out({ type: 'command_result', requestId: command.requestId, ok: true, data: { availableModels: [
          { provider: 'p', id: 'a', name: 'A', reasoning: true, contextWindow: 123 },
          { provider: 'p', id: 'b', name: 'B' }
        ] } });
        return;
      }
      if (command.type === 'start_session') {
        const model = command.model ?? { provider: 'p', id: 'a' };
        currentModels.set(command.sessionId, model);
        out({ type: 'session_active', sessionId: command.sessionId, cwd: command.cwd, model, thinkingLevel: command.thinkingLevel ?? 'medium', availableModels: [{ provider: 'p', id: 'a', name: 'A' }] });
        out({ type: 'command_result', requestId: command.requestId, ok: true });
        return;
      }
      if (command.type === 'send_input') {
        const messageId = command.messageId ?? 'assistant-1';
        out({ type: 'thinking', sessionId: command.sessionId, messageId, delta: 'thinking' });
        out({ type: 'tool_call', sessionId: command.sessionId, messageId, toolCallId: 'tool-1', toolName: 'read', input: { path: 'x' } });
        out({ type: 'tool_result', sessionId: command.sessionId, messageId, toolCallId: 'tool-1', output: 'ok', success: true });
        out({ type: 'text', sessionId: command.sessionId, messageId, delta: 'hello ' });
        out({ type: 'text', sessionId: command.sessionId, messageId, delta: 'world' });
        out({ type: 'done', sessionId: command.sessionId, messageId });
        out({ type: 'command_result', requestId: command.requestId, ok: true });
        return;
      }
      if (command.type === 'set_model') {
        if (command.model.id === 'missing') {
          out({ type: 'model_set_result', sessionId: command.sessionId, requestId: command.requestId, ok: false, error: 'missing model' });
          out({ type: 'command_result', requestId: command.requestId, ok: false, error: 'missing model' });
          return;
        }
        currentModels.set(command.sessionId, command.model);
        out({ type: 'model_set_result', sessionId: command.sessionId, requestId: command.requestId, ok: true, model: command.model });
        out({ type: 'session_metadata_update', sessionId: command.sessionId, model: command.model, thinkingLevel: 'medium', availableModels: [{ provider: 'p', id: command.model.id }] });
        out({ type: 'command_result', requestId: command.requestId, ok: true });
        return;
      }
      if (command.type === 'set_thinking_level') {
        const model = currentModels.get(command.sessionId) ?? { provider: 'p', id: 'a' };
        out({ type: 'session_metadata_update', sessionId: command.sessionId, model, thinkingLevel: command.level, availableModels: [{ provider: model.provider, id: model.id }] });
        out({ type: 'command_result', requestId: command.requestId, ok: true });
        return;
      }
      if (command.type === 'abort') {
        out({ type: 'done', sessionId: command.sessionId, messageId: 'abort-message', aborted: true });
        out({ type: 'command_result', requestId: command.requestId, ok: true });
      }
    });
  `);
  return file;
}

function createCapturingSseManager(events: SseEvent[]): SseManager {
  return {
    subscribe: () => { throw new Error('not used'); },
    unsubscribe: () => undefined,
    broadcast: (event) => { events.push(event); },
    broadcastToSession: (_sessionId, event) => { events.push(event); },
    observe: () => () => undefined,
    clientCount: () => 0,
  };
}

describe('RunnerOrchestrator', () => {
  const orchestrators: RunnerOrchestrator[] = [];

  afterEach(async () => {
    await Promise.all(orchestrators.map((orchestrator) => orchestrator.dispose().catch(() => undefined)));
    orchestrators.length = 0;
  });

  async function setup() {
    const script = await writeFakeRunner();
    const runner = new RunnerProcessClient({ command: process.execPath, args: [script], requestTimeoutMs: 1_000 });
    const sessionStore = createSessionStore();
    const events: SseEvent[] = [];
    const orchestrator = createRunnerOrchestrator({
      config: {
        port: 0,
        nodeEnv: 'test',
        homeDir: '/tmp',
        sessionsDir: '/tmp/pi-web-test/sessions',
        sdkCwd: '/tmp/project',
        model: 'p/a',
        corsOrigins: [],
        logLevel: 'error',
        sessionIdPrefix: 'test',
        generateSessionId: (() => {
          let index = 0;
          return () => `id-${++index}`;
        })(),
      },
      sessionStore,
      sseManager: createCapturingSseManager(events),
      runner,
    });
    orchestrators.push(orchestrator);
    return { orchestrator, sessionStore, events };
  }

  it('lists runner-provided models', async () => {
    const { orchestrator } = await setup();

    const models = await orchestrator.listModels('p/b');

    expect(models.map((model) => model.key)).toEqual(['p/a', 'p/b']);
    expect(models.find((model) => model.key === 'p/b')?.isSelected).toBe(true);
    expect(models.find((model) => model.key === 'p/a')?.available).toBe(true);
  });

  it('dispatches prompts, adapts events, and persists messages', async () => {
    const { orchestrator, sessionStore, events } = await setup();

    const result = await orchestrator.prompt({ sessionId: 'session-1', cwd: '/tmp/project', message: 'Say hello', messageId: 'message-1' });

    expect(result.sessionId).toBe('session-1');
    expect(events.map((event) => event.type)).toEqual(['thinking', 'tool_call', 'tool_result', 'text_chunk', 'text_chunk', 'done']);
    const session = sessionStore.getSession('session-1');
    expect(session?.status).toBe('idle');
    expect(session?.messages.map((message) => [message.role, message.content])).toEqual([
      ['user', 'Say hello'],
      ['tool_call', '{"path":"x"}'],
      ['tool_result', 'ok'],
      ['assistant', 'hello world'],
    ]);
  });

  it('updates model and thinking level only after runner confirmation', async () => {
    const { orchestrator, sessionStore } = await setup();
    sessionStore.createSession('/tmp/project', 'p/a', 'session-1');

    await orchestrator.setModel('session-1', 'p/b');
    await orchestrator.setThinkingLevel('session-1', 'high');

    expect(sessionStore.getSession('session-1')?.model).toBe('p/b');
    expect(sessionStore.getSession('session-1')?.thinkingLevel).toBe('high');
  });

  it('surfaces model switch failures', async () => {
    const { orchestrator, sessionStore, events } = await setup();
    sessionStore.createSession('/tmp/project', 'p/a', 'session-1');

    await expect(orchestrator.setModel('session-1', 'p/missing')).rejects.toThrow('missing model');

    expect(sessionStore.getSession('session-1')?.model).toBe('p/a');
    expect(events.some((event) => event.type === 'error' && event.message === 'missing model')).toBe(true);
  });

  it('aborts active sessions through the runner', async () => {
    const { orchestrator, sessionStore, events } = await setup();
    sessionStore.createSession('/tmp/project', 'p/a', 'session-1');

    await orchestrator.abort('session-1');

    expect(events.some((event) => event.type === 'done' && event.aborted)).toBe(true);
  });
});
