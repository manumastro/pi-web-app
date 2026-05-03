import express, { type Request, type Response } from 'express';
import type { Config } from '../../config/index.js';
import type { SseManager } from '../../sse/manager.js';
import type { SessionStore } from '../../sessions/store.js';
import { toSdkGlobalEvent } from '../sdk/event-mapper.js';
import type { SdkGlobalEvent } from '../sdk/types.js';

interface GlobalSseClient {
  id: string;
  response: Response;
}

function writeSse(response: Response, id: number, data: unknown): void {
  response.write(`id: ${id}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
  (response as Response & { flush?: () => void }).flush?.();
}

const STREAM_DELTA_FRAME_MS = 16;
const STREAM_DELTA_CHARS = 6;

function isTextDeltaEvent(event: SdkGlobalEvent): boolean {
  if (event.type !== 'message.part.delta') return false;
  const props = event.properties as Record<string, unknown>;
  return typeof props.partID === 'string' && props.partID.endsWith('-text');
}

function splitDeltaEvent(event: SdkGlobalEvent): SdkGlobalEvent[] {
  if (!isTextDeltaEvent(event)) return [event];
  const props = event.properties as Record<string, unknown>;
  const delta = typeof props.delta === 'string' ? props.delta : '';
  if (delta.length <= STREAM_DELTA_CHARS) return [event];

  const chunks: string[] = [];
  let current = '';
  for (const char of Array.from(delta)) {
    current += char;
    if (current.length >= STREAM_DELTA_CHARS) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);

  return chunks.map((chunk) => ({
    ...event,
    properties: { ...props, delta: chunk },
  }));
}

export function createGlobalEventBridge(params: {
  sseManager: SseManager;
  sessionStore: SessionStore;
  config: Config;
}) {
  const { sseManager, sessionStore, config } = params;
  const router = express.Router();
  const clients = new Map<string, GlobalSseClient>();
  let eventCounter = 0;

  const publish = (event: SdkGlobalEvent): void => {
    const id = ++eventCounter;
    for (const client of clients.values()) {
      writeSse(client.response, id, event);
    }
  };

  const queues = new Map<string, SdkGlobalEvent[]>();
  const timers = new Map<string, NodeJS.Timeout>();

  const drain = (sessionId: string): void => {
    const queue = queues.get(sessionId);
    if (!queue || queue.length === 0) {
      queues.delete(sessionId);
      timers.delete(sessionId);
      return;
    }

    const next = queue.shift()!;
    publish(next);
    const delay = isTextDeltaEvent(next) ? STREAM_DELTA_FRAME_MS : 0;
    const timer = setTimeout(() => drain(sessionId), delay);
    timers.set(sessionId, timer);
  };

  const enqueue = (sessionId: string, event: SdkGlobalEvent): void => {
    const existingQueue = queues.get(sessionId);
    if (!existingQueue && !timers.has(sessionId) && !isTextDeltaEvent(event)) {
      publish(event);
      return;
    }

    const queue = existingQueue ?? [];
    queue.push(...splitDeltaEvent(event));
    queues.set(sessionId, queue);
    if (!timers.has(sessionId)) drain(sessionId);
  };

  const publishMapped = (sessionId: string, mapped: SdkGlobalEvent | SdkGlobalEvent[] | null): void => {
    if (!mapped) return;
    const events = Array.isArray(mapped) ? mapped : [mapped];
    for (const event of events) enqueue(sessionId, event);
  };

  sseManager.observe((event) => {
    publishMapped(event.sessionId, toSdkGlobalEvent(event, sessionStore));
  });

  router.get('/global/event', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.socket?.setNoDelay(true);
    res.flushHeaders?.();

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    clients.set(clientId, { id: clientId, response: res });

    publish({
      type: 'server.connected',
      properties: {
        directory: config.homeDir,
        version: '1.0.0',
      },
    });

    const heartbeat = setInterval(() => {
      publish({ type: 'openchamber:heartbeat', properties: { at: Date.now() } });
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(clientId);
    });
  });

  router.get('/global/event/ws', (_req: Request, res: Response) => {
    res.status(426).json({ error: 'WebSocket upgrade required' });
  });

  // Legacy stream endpoint still consumed by some frontend flows
  router.get('/openchamber/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.socket?.setNoDelay(true);
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'openchamber:event-stream-ready', properties: {} })}\n\n`);

    const interval = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'openchamber:heartbeat', properties: { at: Date.now() } })}\n\n`);
    }, 20000);

    req.on('close', () => {
      clearInterval(interval);
    });
  });

  return { router, publish };
}
