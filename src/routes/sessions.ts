// ── Session Routes (REST API) ──
// POST /api/sessions - Create new session
// POST /api/sessions/:id/load - Load session
// DELETE /api/sessions/:id - Delete session

import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { cwdSessions, createCwdSession, disposeSession, getOrCreateSession, findSessionFileBySessionId } from '../services/sessionManager';
import { SessionManager } from '@mariozechner/pi-coding-agent';

const HOME = process.env.HOME || '/home/manu';

export function registerSessionRoutes(app: any): void {

  // POST /api/sessions - Create new session
  app.post('/api/sessions', async (req: Request, res: Response) => {
    const { cwd } = req.body;
    const targetCwd = cwd || HOME;

    try {
      // Dispose old runtime if exists
      await disposeSession(targetCwd);

      // Create fresh runtime
      const cr = await createCwdSession(targetCwd, SessionManager.create(targetCwd));
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
      const sessionPath = findSessionFileBySessionId(targetCwd, sessionId);
      if (!sessionPath) {
        res.status(404).json({ error: `Session not found: ${sessionId}` });
        return;
      }

      // Check if already active
      const existingCr = cwdSessions.get(targetCwd);
      if (existingCr && existingCr.session.sessionId === sessionId) {
        res.json({
          sessionId: existingCr.session.sessionId,
          sessionFile: existingCr.session.sessionFile,
          isWorking: !existingCr.idle,
          cwd: targetCwd,
        });
        return;
      }

      // Dispose old and load new
      await disposeSession(targetCwd);
      const cr = await createCwdSession(targetCwd, SessionManager.open(sessionPath));

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

  // POST /api/sessions/:id/switch - Switch to another session
  app.post('/api/sessions/:id/switch', async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const { cwd, sessionPath } = req.body;
    const targetCwd = cwd || HOME;

    try {
      let targetPath = sessionPath;
      if (!targetPath) {
        targetPath = findSessionFileBySessionId(targetCwd, sessionId);
      }

      if (!targetPath || !fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'Session file not found' });
        return;
      }

      await disposeSession(targetCwd);
      const cr = await createCwdSession(targetCwd, SessionManager.open(targetPath));

      res.json({
        sessionId: cr.session.sessionId,
        sessionFile: cr.session.sessionFile,
        cwd: targetCwd,
      });
    } catch (e: any) {
      console.error(`[switch_session] error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/sessions/:id - Get session messages
  app.get('/api/sessions/:id', async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const cwd = req.query.cwd as string || HOME;

    const cr = cwdSessions.get(cwd);
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

    // Find and delete session file
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
    const sessionId = req.params.id;
    const { provider, modelId, cwd } = req.body;
    const targetCwd = cwd || HOME;

    const cr = cwdSessions.get(targetCwd);
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