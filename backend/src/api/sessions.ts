import type { Router, Request, Response } from 'express';
import express from 'express';
import type { SessionStore } from '../sessions/store.js';

export function createSessionsRouter(sessionStore: SessionStore): Router {
  const router = express.Router();

  router.get('/', (req: Request, res: Response) => {
    const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
    res.json({ sessions: sessionStore.listSessions(cwd) });
  });

  router.post('/', (req: Request, res: Response) => {
    const cwd = typeof req.body?.cwd === 'string' && req.body.cwd.length > 0 ? req.body.cwd : '/';
    const model = typeof req.body?.model === 'string' ? req.body.model : undefined;
    const id = typeof req.body?.id === 'string' ? req.body.id : undefined;
    const session = sessionStore.createSession(cwd, model, id);
    res.status(201).json({ session });
  });

  router.get('/:id', (req: Request, res: Response) => {
    const sessionId = typeof req.params.id === 'string' ? req.params.id : '';
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ session });
  });

  router.get('/:id/messages', (req: Request, res: Response) => {
    const sessionId = typeof req.params.id === 'string' ? req.params.id : '';
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ messages: session.messages });
  });

  router.delete('/:id', (req: Request, res: Response) => {
    const sessionId = typeof req.params.id === 'string' ? req.params.id : '';
    const deleted = sessionStore.deleteSession(sessionId);
    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.status(204).send();
  });

  return router;
}
