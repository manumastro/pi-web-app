import fs from 'node:fs';
import path from 'node:path';
import type { Router, Request, Response } from 'express';
import express from 'express';

interface DirectoryEntryResponse {
  path: string;
  name: string;
}

export function resolveUnderHome(homeDir: string, input: string | undefined): string {
  const candidate = typeof input === 'string' && input.trim().length > 0 ? input.trim() : homeDir;
  const normalizedInput = candidate === '~' ? homeDir : candidate.startsWith('~/') ? path.join(homeDir, candidate.slice(2)) : candidate;
  const resolvedHome = path.resolve(homeDir);
  const resolvedCandidate = path.resolve(normalizedInput);

  if (resolvedCandidate === resolvedHome || resolvedCandidate.startsWith(`${resolvedHome}${path.sep}`)) {
    return resolvedCandidate;
  }

  throw new Error('Path must be inside the home directory');
}

export function listChildDirectories(dirPath: string, showHidden: boolean): DirectoryEntryResponse[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => showHidden || !entry.name.startsWith('.'))
    .map((entry) => ({
      path: path.join(dirPath, entry.name),
      name: entry.name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));
}

export function createDirectoriesRouter(homeDir: string): Router {
  const router = express.Router();

  router.get('/', (req: Request, res: Response) => {
    const showHidden = req.query.hidden === 'true' || req.query.hidden === '1';

    try {
      const dirPath = resolveUnderHome(homeDir, typeof req.query.path === 'string' ? req.query.path : undefined);
      const directories = listChildDirectories(dirPath, showHidden);
      res.json({ path: dirPath, directories });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid directory' });
    }
  });

  return router;
}
