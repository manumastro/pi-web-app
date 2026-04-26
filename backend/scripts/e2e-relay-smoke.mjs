#!/usr/bin/env node
import { WebSocket } from 'ws';

const baseUrl = process.env.PI_WEB_BASE_URL ?? 'http://127.0.0.1:3210';
const wsUrl = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/api/relay';

class Queue {
  constructor(socket) {
    this.messages = [];
    this.waiters = [];
    socket.on('message', (data) => {
      const event = JSON.parse(String(data));
      const waiter = this.waiters.shift();
      if (waiter) waiter(event);
      else this.messages.push(event);
    });
  }
  next() {
    const event = this.messages.shift();
    if (event) return Promise.resolve(event);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  async waitFor(predicate, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const event = await Promise.race([
        this.next(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('relay wait timeout')), Math.max(1, deadline - Date.now()))),
      ]);
      if (predicate(event)) return event;
    }
    throw new Error('relay wait timeout');
  }
}

async function main() {
  const socket = new WebSocket(wsUrl);
  const queue = new Queue(socket);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const hello = await queue.waitFor((event) => event.type === 'hello');

  socket.send(JSON.stringify({ type: 'ping', requestId: 'ping-1' }));
  await queue.waitFor((event) => event.type === 'pong' && event.requestId === 'ping-1');

  socket.send(JSON.stringify({ type: 'list_models', requestId: 'models-1' }));
  const models = await queue.waitFor((event) => event.type === 'command_result' && event.requestId === 'models-1');
  if (!models.ok || !Array.isArray(models.data?.models) || models.data.models.length === 0) {
    throw new Error(`relay list_models failed: ${JSON.stringify(models)}`);
  }

  socket.close();
  console.log(JSON.stringify({ ok: true, wsUrl, viewerId: hello.viewerId, modelCount: models.data.models.length }, null, 2));
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exit(1);
});
