// ── Session Routes (REST API) ──
// POST /api/sessions - Create new session
// POST /api/sessions/:id/load - Load session
// DELETE /api/sessions/:id - Delete session

import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { SessionManager } from "@mariozechner/pi-coding-agent";

const HOME = process.env.HOME || '/home/manu';

let getCwdSessions: () => Map<string, any>;
let createCwdSessionFn: (cwd: string, sm: any) => Promise<any>;
let disposeSessionFn: (cwd: string) => Promise<void>;
let getOrCreateSessionFn: (cwd: string, forceNew?: boolean, sessionId?: string) => Promise<any>;
let findSessionFileFn: (cwd: string, sessionId: string) => string | null;

export function setSessionContext(
  getSessions: () => Map<string, any>,
  createSession: (cwd: string, sm: any) => Promise<any>,
  dispose: (cwd: string) => Promise<void>,
  getOrCreate: (cwd: string, forceNew?: boolean, sessionId?: string) => Promise<any>,
  findFile: (cwd: string, sessionId: string) => string | null
) {
  getCwdSessions = getSessions;
  createCwdSessionFn = createSession;
  disposeSessionFn = dispose;
  getOrCreateSessionFn = getOrCreate;
  findSessionFileFn = findFile;
}

export function registerSessionRoutes(app: any): void {

  // POST /api/sessions - Create new session
  app.post('/api/sessions', async (req: Request, res: Response) => {
    const { cwd } = req.body;
    const targetCwd = cwd || HOME;

    try {
      await disposeSessionFn(targetCwd);
      const cr = await createCwdSessionFn(targetCwd, SessionManager.create(targetCwd));
      cr.idle = true;

      res.json({
        sessionId: cr.session.sessionId,
        sessionFile: cr.session.sessionFile,
        cwd: cr.cwd,
      });
    } catch (e: any) {
      console.error(`[create_session] error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sessions/:id/load - Load specific session
  app.post('/api/sessions/:id/load', async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const { cwd } = req.body;
    const targetCwd = cwd || HOME;

    try {
      const sessionPath = findSessionFileFn(targetCwd, sessionId);
      if (!sessionPath) {
        res.status(404).json({ error: `Session not found: ${sessionId}` });
        return;
      }

      const existingCr = getCwdSessions().get(targetCwd);
      if (existingCr && existingCr.session.sessionId === sessionId) {
        res.json({
          sessionId: existingCr.session.sessionId,
          sessionFile: existingCr.session.sessionFile,
          isWorking: !existingCr.idle,
          cwd: targetCwd,
        });
        return;
      }

      await disposeSessionFn(targetCwd);
      const cr = await createCwdSessionFn(targetCwd, SessionManager.open(sessionPath));

      res.json({
        sessionId: cr.session.sessionId,
        sessionFile: cr.session.sessionFile,
        isWorking: !cr.idle,
        cwd: targetCwd,
      });
    } catch (e: any) {
      console.error(`[load_session] error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/sessions/:id - Get session messages
  app.get('/api/sessions/:id', async (req: Request, res: Response) => {
    const cwd = req.query.cwd as string || HOME;
    const cr = getCwdSessions().get(cwd);
    
    if (!cr) {
      res.status(404).json({ error: 'No active session' });
      return;
    }

    res.json({
      sessionId: cr.session.sessionId,
      sessionFile: cr.session.sessionFile,
      messages: cr.session.messages,
      isWorking: !cr.idle,
    });
  });

  // DELETE /api/sessions/:id - Delete session from disk
  app.delete('/api/sessions/:id', async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const cwd = req.query.cwd as string || HOME;

    const SESSIONS_DIR = path.join(HOME, '.pi', 'agent', 'sessions');
    if (!fs.existsSync(SESSIONS_DIR)) {
      res.status(404).json({ error: 'Sessions directory not found' });
      return;
    }

    const dirName = cwd.replace(HOME, '').replace(/^\//, '').replace(/\//g, '--');
    const sessionDir = path.join(SESSIONS_DIR, '--' + dirName + '--');
    
    if (!fs.existsSync(sessionDir)) {
      res.status(404).json({ error: 'Session directory not found' });
      return;
    }

    const files = fs.readdirSync(sessionDir).filter(f => f.includes(sessionId) && f.endsWith('.jsonl'));
    if (files.length === 0) {
      res.status(404).json({ error: 'Session file not found' });
      return;
    }

    for (const f of files) {
      fs.unlinkSync(path.join(sessionDir, f));
    }

    res.json({ success: true, deleted: files.length });
  });

  // POST /api/sessions/:id/model - Set model
  app.post('/api/sessions/:id/model', async (req: Request, res: Response) => {
    const { provider, modelId, cwd } = req.body;
    const targetCwd = cwd || HOME;

    const cr = getCwdSessions().get(targetCwd);
    if (!cr) {
      res.status(404).json({ error: 'No active session' });
      return;
    }

    try {
      await cr.session.setModel(provider, modelId);
      res.json({ 
        status: 'model_set', 
        model: cr.session.model?.id,
        provider: cr.session.model?.provider 
      });
    } catch (e: any) {
      console.error(`[set_model] error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });
}