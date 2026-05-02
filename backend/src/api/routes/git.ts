import express, { type Request, type Response } from 'express';
import type { ApiRouteContext } from './context.js';
import { queryStr } from '../shared/request.js';

export function createGitRoutes(ctx: ApiRouteContext) {
  const { config } = ctx;
  const router = express.Router();

  router.get('/vcs', (_req: Request, res: Response) => {
    res.json({ type: 'git', branch: null, remote: null });
  });

  router.get('/git/check', (_req: Request, res: Response) => {
    res.json({ isGitRepository: false });
  });

  router.get('/git/status', (_req: Request, res: Response) => {
    res.json({ branch: null, files: [], ahead: 0, behind: 0, clean: true });
  });

  router.get('/git/branches', (_req: Request, res: Response) => {
    res.json({ branches: [] });
  });

  router.get('/git/worktrees/bootstrap-status', (req: Request, res: Response) => {
    const directory = queryStr(req.query.directory) || config.homeDir;
    res.json({
      status: 'ready',
      error: null,
      updatedAt: Date.now(),
      directory,
    });
  });

  router.get('/git/identities', (_req: Request, res: Response) => {
    res.json([]);
  });

  router.get('/git/global-identity', (_req: Request, res: Response) => {
    res.json({ name: '', email: '', hasGlobalIdentity: false });
  });

  return router;
}
