import path from 'node:path';
import type { Router, Request, Response } from 'express';
import express from 'express';
import type { SessionStore, Session } from '../sessions/store.js';
import { readSessionFileSync } from '../sessions/persistence.js';

function resolveCwd(input: string, homeDir: string): string {
  const trimmed = input.trim();
  if (trimmed === '~') {
    return homeDir;
  }
  if (trimmed.startsWith('~/')) {
    return path.join(homeDir, trimmed.slice(2));
  }
  if (trimmed.startsWith('~\\')) {
    return path.join(homeDir, trimmed.slice(2));
  }
  return trimmed;
}

function refreshSessionFromPiSnapshot(sessionStore: SessionStore, session: Session): Session {
  if (!session.piSessionFile) {
    return session;
  }

  const snapshot = readSessionFileSync(session.piSessionFile);
  if (!snapshot) {
    return session;
  }

  const updates: Partial<Session> = {
    status: snapshot.status,
    messages: snapshot.messages,
  };
  if (snapshot.model !== undefined) {
    updates.model = snapshot.model;
  }
  if (snapshot.thinkingLevel !== undefined) {
    updates.thinkingLevel = snapshot.thinkingLevel;
  }
  if (snapshot.piSessionId !== undefined) {
    updates.piSessionId = snapshot.piSessionId;
  }
  if (snapshot.piSessionFile !== undefined) {
    updates.piSessionFile = snapshot.piSessionFile;
  }
  if (!session.title && snapshot.title) {
    updates.title = snapshot.title;
  }

  return sessionStore.updateSession(session.id, updates) ?? session;
}

export function createSessionsRouter(sessionStore: SessionStore, homeDir: string): Router {
  const router = express.Router();

  router.get('/', (req: Request, res: Response) => {
    const cwd = typeof req.query.cwd === 'string' ? resolveCwd(req.query.cwd, homeDir) : undefined;
    const sessions = sessionStore.listSessions(cwd).map((session) => refreshSessionFromPiSnapshot(sessionStore, session));
    res.json({ sessions });
  });

  router.post('/', (req: Request, res: Response) => {
    const rawCwd = typeof req.body?.cwd === 'string' && req.body.cwd.length > 0 ? req.body.cwd : homeDir;
    const cwd = resolveCwd(rawCwd, homeDir);
    const model = typeof req.body?.model === 'string' ? req.body.model : undefined;
    const id = typeof req.body?.id === 'string' ? req.body.id : undefined;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const session = sessionStore.createSession(cwd, model, id);
    const created = title.length > 0 ? (sessionStore.updateSession(session.id, { title }) ?? session) : session;
    res.status(201).json({ session: created });
  });

  router.get('/:id', (req: Request, res: Response) => {
    const sessionId = typeof req.params.id === 'string' ? req.params.id : '';
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ session: refreshSessionFromPiSnapshot(sessionStore, session) });
  });

  router.get('/:id/messages', (req: Request, res: Response) => {
    const sessionId = typeof req.params.id === 'string' ? req.params.id : '';
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ messages: refreshSessionFromPiSnapshot(sessionStore, session).messages });
  });

  router.put('/:id', (req: Request, res: Response) => {
    const sessionId = typeof req.params.id === 'string' ? req.params.id : '';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const updates: Partial<Session> = {};
    if (title.length > 0) {
      updates.title = title;
    }

    const updated = sessionStore.updateSession(sessionId, updates);

    if (!updated) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({ session: updated });
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
