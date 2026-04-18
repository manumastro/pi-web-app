import type { Router, Request, Response } from 'express';
import express from 'express';
import type { SdkBridge } from '../sdk/bridge.js';

export function createMessagesRouter(bridge: SdkBridge): Router {
  const router = express.Router();

  router.post('/prompt', async (req: Request, res: Response) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const result = await bridge.prompt({
      sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined,
      cwd: typeof req.body?.cwd === 'string' ? req.body.cwd : undefined,
      message,
      model: typeof req.body?.model === 'string' ? req.body.model : undefined,
    });

    res.status(202).json(result);
  });

  router.post('/abort', async (req: Request, res: Response) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    await bridge.abort(sessionId);
    res.json({ ok: true });
  });

  router.post('/steer', async (req: Request, res: Response) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    if (!message || !sessionId) {
      res.status(400).json({ error: 'sessionId and message are required' });
      return;
    }

    await bridge.steer(sessionId, message);
    res.json({ ok: true });
  });

  router.post('/follow-up', async (req: Request, res: Response) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    if (!message || !sessionId) {
      res.status(400).json({ error: 'sessionId and message are required' });
      return;
    }

    await bridge.followUp(sessionId, message);
    res.json({ ok: true });
  });

  return router;
}
