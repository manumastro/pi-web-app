import express, { type Request, type Response } from 'express';
import os from 'node:os';
import type { ApiRouteContext } from './context.js';

export function createMiscRoutes(ctx: ApiRouteContext) {
  const { config } = ctx;
  const router = express.Router();

  router.get('/global/config', (_req: Request, res: Response) => {
    res.json({
      homeDirectory: config.homeDir,
      version: '1.0.0',
    });
  });

  router.get('/config/runtime', (_req: Request, res: Response) => {
    res.json({
      homeDirectory: config.homeDir,
      homeDir: config.homeDir,
      directory: config.homeDir,
      version: '1.0.0',
      platform: os.platform(),
    });
  });

  router.get('/config/themes', (_req: Request, res: Response) => {
    res.json({ themes: [] });
  });

  router.get('/github/auth/status', (_req: Request, res: Response) => {
    res.json({ authenticated: false });
  });

  router.get('/session-folders', (_req: Request, res: Response) => {
    res.json({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: Date.now() });
  });

  router.post('/session-folders', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  router.get('/mcp', (_req: Request, res: Response) => {
    res.json({});
  });

  router.get('/lsp', (_req: Request, res: Response) => {
    res.json({});
  });

  router.get('/question', (_req: Request, res: Response) => {
    res.json([]);
  });

  router.get('/permission', (_req: Request, res: Response) => {
    res.json([]);
  });

  router.post('/log', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  router.post('/client-error', (req: Request, res: Response) => {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const level = typeof body.level === 'string' ? body.level : 'error';
    const source = typeof body.source === 'string' ? body.source : 'frontend';
    const name = typeof body.name === 'string' ? body.name : 'Error';
    const message = typeof body.message === 'string' ? body.message : 'Unknown client error';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;
    const componentStack = typeof body.componentStack === 'string' ? body.componentStack : undefined;
    const stack = typeof body.stack === 'string' ? body.stack : undefined;

    // Intentionally logged to stderr/stdout so we can inspect via journalctl.
    console.error('[client-error]', {
      level,
      source,
      name,
      message,
      sessionId,
      componentStack,
      stack,
      at: Date.now(),
    });

    res.json({ ok: true });
  });

  router.get('/relay/status', (_req: Request, res: Response) => {
    res.json({
      viewers: 0,
      sessions: {},
      transport: 'websocket',
      path: '/api/relay',
    });
  });

  router.post('/projects/:projectId/icon/discover', (_req: Request, res: Response) => {
    res.json({ icon: null, color: null });
  });

  // Legacy namespace endpoints still used by frontend stores
  router.get('/openchamber/models-metadata', (_req: Request, res: Response) => {
    res.json({ models: [] });
  });

  router.get('/openchamber/update-check', (_req: Request, res: Response) => {
    res.json({ updateAvailable: false });
  });

  return router;
}
