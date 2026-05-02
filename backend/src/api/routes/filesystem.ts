import express, { type Request, type Response } from 'express';
import type { ApiRouteContext } from './context.js';
import { listDirectoryEntries, readTextFileOrEmpty } from '../shared/filesystem.js';
import { queryStr } from '../shared/request.js';

export function createFilesystemRoutes(ctx: ApiRouteContext) {
  const { config } = ctx;
  const router = express.Router();

  const listDirectory = (req: Request, res: Response) => {
    const requestedPath = queryStr(req.query.path).trim() || config.homeDir;
    try {
      res.json({ entries: listDirectoryEntries(requestedPath) });
    } catch {
      res.status(404).json({ error: 'Not Found' });
    }
  };

  const readFile = (req: Request, res: Response) => {
    const targetPath = queryStr(req.query.path);
    if (!targetPath) {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    res.json({ path: targetPath, content: readTextFileOrEmpty(targetPath) });
  };

  router.get('/file', listDirectory);
  router.get('/file/content', readFile);

  router.get('/fs/home', (_req: Request, res: Response) => {
    try {
      res.json({ entries: listDirectoryEntries(config.homeDir) });
    } catch {
      res.status(404).json({ error: 'Not Found' });
    }
  });

  router.get('/fs/list', listDirectory);
  router.get('/fs/read', readFile);

  router.post('/fs/exec', (_req: Request, res: Response) => {
    res.json({ code: 0, stdout: '', stderr: '' });
  });

  return router;
}
