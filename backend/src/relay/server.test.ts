import http from 'node:http';
import express from 'express';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionStore } from '../sessions/store.js';
import { createSseManager } from '../sse/manager.js';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';
import { installRelayServer, type RelayServerHandle } from './server.js';

class MessageQueue {
  private messages: unknown[] = [];
  private waiters: Array<(value: unknown) => void> = [];

  constructor(socket: WebSocket) {
    socket.on('message', (data) => {
      const event = JSON.parse(String(data));
      const waiter = this.waiters.shift();
      if (waiter) waiter(event);
      else this.messages.push(event);
    });
  }

  next(): Promise<any> {
    const message = this.messages.shift();
    if (message) return Promise.resolve(message);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async waitFor(predicate: (event: any) => boolean): Promise<any> {
    for (let index = 0; index < 20; index++) {
      const event = await this.next();
      if (predicate(event)) return event;
    }
    throw new Error('timed out waiting for relay event');
  }
}

describe('relay websocket server', () => {
  const handles: RelayServerHandle[] = [];
  const servers: http.Server[] = [];
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets) socket.terminate();
    sockets.length = 0;
    await Promise.all(handles.map((handle) => handle.close()));
    handles.length = 0;
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    servers.length = 0;
  });

  async function setup() {
    const app = express();
    const server = http.createServer(app);
    const sessionStore = createSessionStore();
    sessionStore.createSession('/tmp', 'p/a', 'session-1');
    const sseManager = createSseManager();
    const orchestrator: RunnerOrchestrator = {
      listModels: async () => [],
      prompt: async () => ({ sessionId: 'session-1', assistantMessage: '' }),
      abort: async () => undefined,
      setModel: async () => undefined,
      setThinkingLevel: async () => undefined,
      getThinkingLevels: async () => ({ currentLevel: 'medium', availableLevels: ['minimal', 'low', 'medium', 'high', 'xhigh'] }),
      dispose: async () => undefined,
    };
    const handle = installRelayServer({ server, orchestrator, sessionStore, sseManager });
    handles.push(handle);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not listen');
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/relay`);
    sockets.push(socket);
    const queue = new MessageQueue(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    await queue.waitFor((event) => event.type === 'hello');
    return { socket, queue, sseManager, handle };
  }

  it('subscribes viewers and relays SSE events to subscribed sessions', async () => {
    const { socket, queue, sseManager, handle } = await setup();

    socket.send(JSON.stringify({ type: 'subscribe', requestId: 'r1', sessionId: 'session-1' }));
    await queue.waitFor((event) => event.type === 'subscribed' && event.sessionId === 'session-1');
    const result = await queue.waitFor((event) => event.type === 'command_result' && event.requestId === 'r1');
    expect(result.ok).toBe(true);
    expect(handle.sessionViewerCounts()).toEqual({ 'session-1': 1 });

    sseManager.broadcast({ type: 'text_chunk', sessionId: 'session-1', messageId: 'm1', content: 'hello', timestamp: 'now' });
    const relayed = await queue.waitFor((event) => event.type === 'sse_event');
    expect(relayed.event).toMatchObject({ type: 'text_chunk', sessionId: 'session-1', content: 'hello' });
  });

  it('executes viewer commands through the orchestrator', async () => {
    const { socket, queue } = await setup();

    socket.send(JSON.stringify({ type: 'prompt', requestId: 'r2', sessionId: 'session-1', message: 'hi' }));
    const result = await queue.waitFor((event) => event.type === 'command_result' && event.requestId === 'r2');

    expect(result).toMatchObject({ ok: true, data: { sessionId: 'session-1' } });
  });

  it('reports invalid commands as recoverable errors', async () => {
    const { socket, queue } = await setup();

    socket.send(JSON.stringify({ type: 'subscribe' }));
    const error = await queue.waitFor((event) => event.type === 'error');

    expect(error.recoverable).toBe(true);
  });
});
