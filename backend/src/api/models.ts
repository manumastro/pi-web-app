import type { Router, Request, Response } from 'express';
import express from 'express';
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

  router.put('/session/model', async (req: Request, res: Response) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const modelKey = typeof req.body?.modelId === 'string' ? req.body.modelId : '';
    if (!sessionId || !modelKey) {
      res.status(400).json({ error: 'sessionId and modelId are required' });
      return;
    }

    await bridge.setModel(sessionId, modelKey);
    const session = sessionStore.getSession(sessionId);
    res.json({ session });
  });

  return router;
}
