import type { Request, Response, Router } from 'express';
import express from 'express';
import type { SseManager } from './manager.js';

export function createSseRouter(sseManager: SseManager): Router {
  const router = express.Router();

  router.get('/', (req: Request, res: Response) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const lastEventId = typeof req.header('last-event-id') === 'string'
      ? req.header('last-event-id')
      : typeof req.query.lastEventId === 'string'
        ? req.query.lastEventId
        : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const client = sseManager.subscribe(sessionId, res, lastEventId ?? undefined);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseManager.unsubscribe(client.id);
      res.end();
    });
  });

  return router;
}
