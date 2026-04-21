import type { Router, Request, Response } from 'express';
import express from 'express';
import type { ThinkingLevel } from '@mariozechner/pi-ai';
import type { SessionStore } from '../sessions/store.js';
import type { SdkBridge } from '../sdk/bridge.js';

export function createModelsRouter(params: { bridge: SdkBridge; sessionStore: SessionStore }): Router {
  const { bridge, sessionStore } = params;
  const router = express.Router();

  router.get('/', async (req: Request, res: Response) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    const currentSessionModel = sessionId ? sessionStore.getSession(sessionId)?.model : undefined;
    const models = await bridge.listModels(currentSessionModel);
    res.json({ models });
  });

  router.get('/session/thinking', async (req: Request, res: Response) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    try {
      const payload = await bridge.getThinkingLevels(sessionId);
      res.json(payload);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(400).json({ error: message });
    }
  });

  router.put('/session/model', async (req: Request, res: Response) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const modelKey = typeof req.body?.modelId === 'string' ? req.body.modelId : '';
    if (!sessionId || !modelKey) {
      res.status(400).json({ error: 'sessionId and modelId are required' });
      return;
    }

    try {
      await bridge.setModel(sessionId, modelKey);
      const session = sessionStore.getSession(sessionId);
      res.json({ session });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(400).json({ error: message });
    }
  });

  router.put('/session/thinking', async (req: Request, res: Response) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const rawThinkingLevel = typeof req.body?.thinkingLevel === 'string' ? req.body.thinkingLevel.trim().toLowerCase() : '';
    const allowedThinkingLevels: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
    if (!sessionId || !allowedThinkingLevels.includes(rawThinkingLevel as ThinkingLevel)) {
      res.status(400).json({ error: 'sessionId and a valid thinkingLevel are required' });
      return;
    }

    try {
      await bridge.setThinkingLevel(sessionId, rawThinkingLevel as ThinkingLevel);
      const session = sessionStore.getSession(sessionId);
      res.json({ session });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
