import type { Router, Request, Response } from 'express';
import express from 'express';
import type { SessionStore } from '../sessions/store.js';
import { THINKING_LEVELS, type ThinkingLevel } from '../types/thinking.js';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';

export function createModelsRouter(params: { runner: RunnerOrchestrator; sessionStore: SessionStore }): Router {
  const { runner, sessionStore } = params;
  const router = express.Router();

  router.get('/', async (req: Request, res: Response) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    if (!sessionId) {
      res.json({ models: [] });
      return;
    }
    try {
      const models = await runner.listModels(sessionId);
      res.json({ models });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(503).json({ error: message });
    }
  });

  router.get('/session/thinking', async (req: Request, res: Response) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    try {
      const payload = await runner.getThinkingLevels(sessionId);
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
      await runner.setModel(sessionId, modelKey);
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
    if (!sessionId || !THINKING_LEVELS.includes(rawThinkingLevel as ThinkingLevel)) {
      res.status(400).json({ error: 'sessionId and a valid thinkingLevel are required' });
      return;
    }

    try {
      await runner.setThinkingLevel(sessionId, rawThinkingLevel as ThinkingLevel);
      const session = sessionStore.getSession(sessionId);
      res.json({ session });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
