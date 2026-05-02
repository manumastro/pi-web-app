import express, { type Request, type Response } from 'express';
import type { ApiRouteContext } from './context.js';
import { paramStr, queryStr } from '../shared/request.js';
import { toSdkMessageInfo, toSdkMessages, toSdkParts, toSdkSession, toSdkSessionStatus } from '../sdk/mappers.js';

export function createSessionRoutes(ctx: ApiRouteContext) {
  const { runner, sessionStore, config, publishGlobalEvent } = ctx;
  const router = express.Router();

  router.get('/session', (req: Request, res: Response) => {
    const rawDirectory = queryStr(req.query.directory).trim();
    const normalizedDirectory = rawDirectory.replace(/[\\/]+$/, '');
    const allSessions = sessionStore.listSessions();
    const sessions = !normalizedDirectory || normalizedDirectory === '/'
      ? allSessions
      : allSessions.filter((s) => {
          const cwd = (s.cwd || '').replace(/[\\/]+$/, '');
          return cwd === normalizedDirectory || cwd.startsWith(`${normalizedDirectory}/`);
        });

    res.json(sessions.map((s) => toSdkSession(s)));
  });

  router.post('/session', (req: Request, res: Response) => {
    const directory = queryStr(req.query.directory).trim()
      || (typeof req.body?.directory === 'string' ? req.body.directory.trim() : '')
      || config.homeDir;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';

    try {
      const session = sessionStore.createSession(directory, undefined);
      if (title) sessionStore.updateSession(session.id, { title });
      const finalSession = sessionStore.getSession(session.id) ?? session;

      publishGlobalEvent({
        type: 'session.created',
        properties: { info: toSdkSession(finalSession) },
      });

      res.json(toSdkSession(finalSession));
    } catch (error) {
      res.status(400).json({ error: 'Failed to create session', message: String(error) });
    }
  });

  router.get('/session/status', (req: Request, res: Response) => {
    const rawDirectory = queryStr(req.query.directory).trim();
    const normalizedDirectory = rawDirectory.replace(/[\\/]+$/, '');
    const allSessions = sessionStore.listSessions();
    const sessions = !normalizedDirectory || normalizedDirectory === '/'
      ? allSessions
      : allSessions.filter((s) => {
          const cwd = (s.cwd || '').replace(/[\\/]+$/, '');
          return cwd === normalizedDirectory || cwd.startsWith(`${normalizedDirectory}/`);
        });

    const payload: Record<string, { type: 'idle' | 'busy' | 'retry' }> = {};
    for (const session of sessions) {
      payload[session.id] = toSdkSessionStatus(session.status);
    }

    res.json(payload);
  });

  router.get('/session/:sessionId', (req: Request, res: Response) => {
    const session = sessionStore.getSession(paramStr(req.params.sessionId));
    if (!session) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    res.json(toSdkSession(session));
  });

  router.put('/session/:sessionId', (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const updated = sessionStore.updateSession(sessionId, { title });
    if (!updated) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    publishGlobalEvent({ type: 'session.updated', properties: { info: toSdkSession(updated) } });
    res.json(toSdkSession(updated));
  });

  router.delete('/session/:sessionId', (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const sessionSnapshot = toSdkSession(session);
    const deleted = sessionStore.deleteSession(sessionId);
    if (!deleted) {
      res.status(500).json({ error: 'Failed to delete session' });
      return;
    }

    publishGlobalEvent({ type: 'session.deleted', properties: { info: sessionSnapshot } });
    res.json(true);
  });

  router.get('/session/:sessionId/message', (req: Request, res: Response) => {
    const session = sessionStore.getSession(paramStr(req.params.sessionId));
    if (!session) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    res.json(toSdkMessages(session.id, session.messages));
  });

  router.get('/session/:sessionId/message/:messageId', (req: Request, res: Response) => {
    const session = sessionStore.getSession(paramStr(req.params.sessionId));
    if (!session) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const msg = session.messages.find((m) => m.id === paramStr(req.params.messageId));
    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    res.json({
      info: toSdkMessageInfo(session.id, msg),
      parts: toSdkParts(session.id, msg),
    });
  });

  router.post('/session/:sessionId/prompt_async', async (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const parts = Array.isArray(req.body?.parts) ? req.body.parts : [];
    const textPart = parts.find((p: Record<string, unknown>) => p.type === 'text');
    const message = typeof textPart?.text === 'string' ? textPart.text.trim() : '';
    const model = req.body?.model;
    const modelKey = model ? `${String(model.providerID)}/${String(model.modelID)}` : undefined;
    const messageId = typeof req.body?.messageID === 'string' ? req.body.messageID : undefined;

    if (!message) {
      res.status(400).json({ error: 'Text part is required' });
      return;
    }

    try {
      const fileParts = parts.filter((p: Record<string, unknown>) => p.type === 'file');
      let promptMessage = message;

      if (fileParts.length > 0) {
        const header = 'Use the read tool to inspect these image files when needed:';
        const lines = fileParts.map((fp: Record<string, unknown>) => {
          const url = typeof fp.url === 'string' ? fp.url : '';
          const filename = typeof fp.filename === 'string' ? fp.filename : 'image';
          if (url.startsWith('data:')) return `- [uploaded] ${filename}`;
          return `- ${url || filename}`;
        });
        promptMessage = `${message}\n\n${header}\n${lines.join('\n')}`;
      }

      const previousModel = session.model;
      if (modelKey) sessionStore.updateSession(sessionId, { model: modelKey });
      sessionStore.updateSession(sessionId, { status: 'busy' });

      publishGlobalEvent({
        type: 'session.status',
        properties: {
          sessionID: sessionId,
          status: { type: 'busy' },
        },
      });

      const runPrompt = async (): Promise<void> => {
        try {
          await runner.prompt({
            sessionId,
            cwd: session.cwd,
            message: promptMessage,
            displayMessage: message,
            ...(modelKey !== undefined ? { model: modelKey } : {}),
            ...(messageId ? { messageId } : {}),
          });
          return;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isModelNotFound = errorMessage.toLowerCase().includes('model not found');
          if (modelKey && isModelNotFound) {
            const models = await runner.listModels();
            const fallbackModel =
              models.find((m) => m.available && m.authConfigured)?.key
              ?? models.find((m) => m.available)?.key
              ?? models[0]?.key;

            console.warn('[api] prompt_async fallback model', {
              sessionId,
              rejectedModel: modelKey,
              fallbackModel,
            });

            if (fallbackModel) {
              sessionStore.updateSession(sessionId, { model: fallbackModel });
              await runner.prompt({
                sessionId,
                cwd: session.cwd,
                message: promptMessage,
                displayMessage: message,
                model: fallbackModel,
                ...(messageId ? { messageId } : {}),
              });
            } else {
              sessionStore.updateSession(sessionId, { model: previousModel });
              await runner.prompt({
                sessionId,
                cwd: session.cwd,
                message: promptMessage,
                displayMessage: message,
                ...(messageId ? { messageId } : {}),
              });
            }
            return;
          }
          throw error;
        }
      };

      void runPrompt().catch((error) => {
        console.error('[api] prompt_async failed', {
          sessionId,
          modelKey,
          error: error instanceof Error ? error.message : String(error),
        });
        sessionStore.updateSession(sessionId, { status: 'error' });
        publishGlobalEvent({
          type: 'session.error',
          properties: {
            sessionID: sessionId,
            error: {
              name: 'UnknownError',
              data: { message: error instanceof Error ? error.message : String(error) },
            },
          },
        });
      });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to send prompt', message: String(error) });
    }
  });

  router.post('/session/:sessionId/abort', async (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      await runner.abort(sessionId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/experimental/session', (req: Request, res: Response) => {
    const rawDirectory = queryStr(req.query.directory).trim();
    const normalizedDirectory = rawDirectory.replace(/[\\/]+$/, '');
    const limit = Number.parseInt(queryStr(req.query.limit), 10) || 200;

    let sessions = sessionStore.listSessions();
    if (normalizedDirectory && normalizedDirectory !== '/') {
      sessions = sessions.filter((s) => {
        const cwd = (s.cwd || '').replace(/[\\/]+$/, '');
        return cwd === normalizedDirectory || cwd.startsWith(`${normalizedDirectory}/`);
      });
    }

    res.json(sessions.slice(0, limit).map((session) => toSdkSession(session)));
  });

  return router;
}
