import express, { type Request, type Response } from 'express';
import type { ApiRouteContext } from './context.js';
import { paramStr, queryStr } from '../shared/request.js';
import { getExternalMessageId, toSdkMessageInfo, toSdkMessages, toSdkParts, toSdkSession, toSdkSessionStatus } from '../sdk/mappers.js';
import { THINKING_LEVELS, type ThinkingLevel } from '../../types/thinking.js';

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

    res.json(toSdkMessages(session));
  });

  router.get('/session/:sessionId/message/:messageId', (req: Request, res: Response) => {
    const session = sessionStore.getSession(paramStr(req.params.sessionId));
    if (!session) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const requestedMessageId = paramStr(req.params.messageId);
    const msg = session.messages.find((m) => getExternalMessageId(m) === requestedMessageId || m.id === requestedMessageId);
    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    res.json({
      info: toSdkMessageInfo(session, msg),
      parts: toSdkParts(session.id, msg),
    });
  });

  const normalizeIncomingModelKey = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const normalized = trimmed.toLowerCase();
    if (normalized === 'minimax/minimax-m2.7' || normalized === 'minimax.minimax-m2.7') {
      return 'minimax/MiniMax-M2.7';
    }
    if (normalized === 'minimax/minimax-m2.7-highspeed' || normalized === 'minimax.minimax-m2.7-highspeed') {
      return 'minimax/MiniMax-M2.7-highspeed';
    }
    return trimmed;
  };

  const normalizeModelLookupKey = (value: string): string => {
    const trimmed = value.trim().toLowerCase();
    return trimmed.includes('/') ? trimmed : trimmed.replace('.', '/');
  };

  const resolveCanonicalModelKey = async (requested: string, sessionId: string): Promise<string | undefined> => {
    const models = await runner.listModels(sessionId);
    const requestedNormalized = normalizeModelLookupKey(requested);
    const match = models.find((model) => {
      const keyNormalized = normalizeModelLookupKey(model.key);
      const providerIdNormalized = normalizeModelLookupKey(`${model.provider}/${model.id}`);
      return requestedNormalized === keyNormalized || requestedNormalized === providerIdNormalized;
    });
    return match?.key;
  };

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
    const rawModelKey = model ? `${String(model.providerID)}/${String(model.modelID)}` : undefined;
    const modelKey = normalizeIncomingModelKey(rawModelKey);
    const messageId = typeof req.body?.messageID === 'string' ? req.body.messageID : undefined;

    console.info('[api] prompt_async request', {
      sessionId,
      messageId,
      rawModelKey,
      normalizedModelKey: modelKey,
      currentSessionModel: session.model,
    });

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

      let effectiveModelKey = modelKey;
      if (modelKey) {
        const canonicalModelKey = await resolveCanonicalModelKey(modelKey, sessionId);
        if (!canonicalModelKey) {
          console.warn('[api] prompt_async model key not found in capabilities, forwarding as-is', {
            sessionId,
            messageId,
            requestedModel: modelKey,
          });
          effectiveModelKey = modelKey;
        } else {
          effectiveModelKey = canonicalModelKey;
          if (canonicalModelKey !== modelKey) {
            console.info('[api] prompt_async canonicalized model key', {
              sessionId,
              messageId,
              requestedModel: modelKey,
              canonicalModelKey,
            });
          }
        }
        sessionStore.updateSession(sessionId, { model: effectiveModelKey });
      }
      sessionStore.updateSession(sessionId, { status: 'busy' });

      publishGlobalEvent({
        type: 'session.status',
        properties: {
          sessionID: sessionId,
          status: { type: 'busy' },
        },
      });

      // Extract thinkingLevel from request body (also accept OpenChamber "variant")
      const rawThinkingLevel =
        typeof req.body?.thinkingLevel === 'string'
          ? req.body.thinkingLevel.trim()
          : typeof req.body?.variant === 'string'
            ? req.body.variant.trim()
            : typeof req.body?.model?.variant === 'string'
              ? req.body.model.variant.trim()
              : undefined;
      const thinkingLevel = THINKING_LEVELS.includes(rawThinkingLevel as ThinkingLevel)
        ? (rawThinkingLevel as ThinkingLevel)
        : undefined;

      if (thinkingLevel) {
        sessionStore.updateSession(sessionId, { thinkingLevel });
      }

      const runPrompt = async (): Promise<void> => {
        await runner.prompt({
          sessionId,
          cwd: session.cwd,
          message: promptMessage,
          displayMessage: message,
          ...(effectiveModelKey !== undefined ? { model: effectiveModelKey } : {}),
          ...(messageId ? { messageId } : {}),
          ...(thinkingLevel ? { thinkingLevel } : {}),
        });
        console.info('[api] prompt_async dispatched', {
          sessionId,
          messageId,
          model: effectiveModelKey ?? sessionStore.getSession(sessionId)?.model,
        });
      };

      void runPrompt().catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[api] prompt_async failed', {
          sessionId,
          modelKey,
          error: errorMessage,
        });
        sessionStore.updateSession(sessionId, { status: 'error' });
        const failedModel = sessionStore.getSession(sessionId)?.model;
        sessionStore.addMessage(sessionId, {
          role: 'assistant',
          content: `Model error: ${errorMessage}`,
          ...(failedModel ? { model: failedModel } : {}),
        });
        publishGlobalEvent({
          type: 'session.error',
          properties: {
            sessionID: sessionId,
            error: {
              name: 'UnknownError',
              message: errorMessage,
              data: { message: errorMessage },
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

  router.get('/session/:sessionId/thinking-levels', async (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const result = await runner.getThinkingLevels(sessionId);
      res.json({ levels: result.availableLevels, current: session.thinkingLevel ?? null });
    } catch (error) {
      res.json({ levels: [], current: session.thinkingLevel ?? null });
    }
  });

  router.put('/session/:sessionId/thinking', async (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const thinkingLevel = typeof req.body?.level === 'string' ? req.body.level.trim() : undefined;
    if (!thinkingLevel) {
      res.status(400).json({ error: 'level is required' });
      return;
    }

    try {
      await runner.setThinkingLevel(sessionId, thinkingLevel);
      res.json({ ok: true, thinkingLevel });
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

  // Frontend compatibility: fire-and-forget notification used after sends
  router.post('/sessions/:sessionId/message-sent', (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const session = sessionStore.getSession(sessionId);
    if (session) {
      // no-op touch for compatibility (keeps endpoint non-404)
      sessionStore.updateSession(sessionId, {});
    }
    res.status(204).send();
  });

  return router;
}
