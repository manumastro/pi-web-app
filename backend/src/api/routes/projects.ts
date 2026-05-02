import express, { type Request, type Response } from 'express';
import path from 'node:path';
import type { ApiRouteContext } from './context.js';
import { queryStr } from '../shared/request.js';

export function createProjectRoutes(ctx: ApiRouteContext) {
  const { config } = ctx;
  const router = express.Router();

  router.get('/path', (req: Request, res: Response) => {
    const directory = queryStr(req.query.directory).trim() || config.homeDir;
    res.json({ path: directory });
  });

  router.get('/project', (req: Request, res: Response) => {
    const directory = queryStr(req.query.directory).trim() || config.homeDir;
    const now = Date.now();
    res.json([{
      id: 'pi-web-project',
      worktree: directory,
      vcs: 'git',
      name: path.basename(directory) || directory,
      time: { created: now, updated: now, initialized: now },
      sandboxes: [],
    }]);
  });

  router.get('/project/current', (req: Request, res: Response) => {
    const directory = queryStr(req.query.directory).trim() || config.homeDir;
    const now = Date.now();
    res.json({
      id: 'pi-web-project',
      worktree: directory,
      vcs: 'git',
      name: path.basename(directory) || directory,
      time: { created: now, updated: now, initialized: now },
      sandboxes: [],
    });
  });

  return router;
}
