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

  sseManager.observe((event) => {
    const mapped = toSdkGlobalEvent(event, sessionStore);
    if (mapped) publish(mapped);
  });

  router.get('/global/event', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
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
