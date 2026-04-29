import type { Request, Response, Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

interface ForensicPayload {
  type?: string;
  sessionId?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export function createForensicsRouter(sessionsDir: string): Router {
  const router = express.Router();
  const forensicDir = path.join(sessionsDir, '.forensics');
  const forensicFile = path.join(forensicDir, 'client-events.ndjson');

  const append = (entry: Record<string, unknown>): void => {
    try {
      fs.mkdirSync(forensicDir, { recursive: true });
      fs.appendFileSync(forensicFile, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch {
      // Best effort logging only.
    }
  };

  router.post('/client', (req: Request, res: Response) => {
    const payload = (req.body ?? {}) as ForensicPayload;
    append({
      at: new Date().toISOString(),
      ip: req.ip,
      ua: req.header('user-agent') ?? '',
      ...payload,
    });
    res.status(202).json({ ok: true });
  });

  router.get('/tail', (_req: Request, res: Response) => {
    try {
      if (!fs.existsSync(forensicFile)) {
        res.json({ events: [] });
        return;
      }
      const lines = fs.readFileSync(forensicFile, 'utf8').trim().split('\n').filter(Boolean);
      const tail = lines.slice(-200).map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return { raw: line };
        }
      });
      res.json({ events: tail });
    } catch (cause) {
      res.status(500).json({ error: cause instanceof Error ? cause.message : String(cause) });
    }
  });

  return router;
}
