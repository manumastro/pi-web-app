import type { Router, Request, Response } from 'express';
import express from 'express';
import type { SessionStore } from '../sessions/store.js';
import { listModels, resolveModelId } from '../models/resolver.js';
import type { SdkBridge } from '../sdk/bridge.js';

export function createModelsRouter(params: { bridge: SdkBridge; sessionStore: SessionStore }): Router {
  const { bridge, sessionStore } = params;
  const router = express.Router();

  router.get('/', (_req: Request, res: Response) => {
    const currentModel = sessionStore.listSessions()[0]?.model;
    res.json({ models: listModels(currentModel) });
  });

  router.put('/session/model', async (req: Request, res: Response) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const modelId = typeof req.body?.modelId === 'string' ? req.body.modelId : '';
    if (!sessionId || !modelId) {
      res.status(400).json({ error: 'sessionId and modelId are required' });
      return;
    }

    await bridge.setModel(sessionId, resolveModelId(modelId));
    const session = sessionStore.getSession(sessionId);
    res.json({ session });
  });

  return router;
}
