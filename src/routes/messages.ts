// ── Message Routes (REST API) ──
// POST /api/sessions/prompt - Send prompt (CWD-based)
// POST /api/sessions/steer - Send steering
// POST /api/sessions/follow_up - Send follow-up
// POST /api/sessions/abort - Abort

import type { Request, Response } from 'express';

let getCwdSessions: () => Map<string, any>;
let getOrCreateSessionFn: (cwd: string, forceNew?: boolean, sessionId?: string) => Promise<any>;
let broadcastToSSEFn: (cwd: string, eventType: string, data: any) => void;

export function setMessageContext(
  getSessions: () => Map<string, any>,
  getOrCreate: (cwd: string, forceNew?: boolean, sessionId?: string) => Promise<any>,
  broadcast: (cwd: string, eventType: string, data: any) => void
) {
  getCwdSessions = getSessions;
  getOrCreateSessionFn = getOrCreate;
  broadcastToSSEFn = broadcast;
}

export function registerMessageRoutes(app: any): void {
  // POST /api/sessions/prompt
  app.post('/api/sessions/prompt', async (req: Request, res: Response) => {
    const { text, cwd, images } = req.body;
    if (!text) { res.status(400).json({ error: 'Missing text' }); return; }
    const targetCwd = cwd || process.env.HOME || '/home/manu';
    try {
      const cr = await getOrCreateSessionFn(targetCwd, false, undefined);
      cr.lastPromptMsg = text;
      cr.lastPromptImages = images || null;
      console.log(`🚀 [${targetCwd}] POST prompt: ${text.substring(0, 100)}...`);
      const promptOpts: any = {};
      if (!cr.idle) promptOpts.streamingBehavior = "steer";
      if (images?.length) promptOpts.images = images;
      cr.idle = false;
      cr.session.prompt(text, promptOpts).then(() => {
        console.log(`[prompt] ${targetCwd}: prompt resolved successfully`);
      }).catch((err: Error) => {
        console.error(`[prompt error] ${targetCwd}: ${err.message}`);
        console.error(`[prompt error] Stack: ${err.stack}`);
        broadcastToSSEFn(targetCwd, 'error', { message: err.message });
      });
      res.json({ status: 'prompt_sent', cwd: targetCwd });
    } catch (e: any) {
      console.error(`[prompt] Runtime creation failed: ${e.message}`);
      res.status(500).json({ error: `Failed to create session: ${e.message}` });
    }
  });

  // POST /api/sessions/steer
  app.post('/api/sessions/steer', async (req: Request, res: Response) => {
    const { text, cwd } = req.body;
    if (!text) { res.status(400).json({ error: 'Missing text' }); return; }
    const targetCwd = cwd || process.env.HOME || '/home/manu';
    const cr = getCwdSessions().get(targetCwd);
    if (!cr) { res.status(404).json({ error: 'No active session' }); return; }
    try { await cr.session.steer(text); res.json({ status: 'steer_sent' }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/sessions/follow_up
  app.post('/api/sessions/follow_up', async (req: Request, res: Response) => {
    const { text, cwd } = req.body;
    if (!text) { res.status(400).json({ error: 'Missing text' }); return; }
    const targetCwd = cwd || process.env.HOME || '/home/manu';
    const cr = getCwdSessions().get(targetCwd);
    if (!cr) { res.status(404).json({ error: 'No active session' }); return; }
    try { await cr.session.followUp(text); res.json({ status: 'follow_up_sent' }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/sessions/abort
  app.post('/api/sessions/abort', async (req: Request, res: Response) => {
    const { cwd } = req.body;
    const targetCwd = cwd || process.env.HOME || '/home/manu';
    const cr = getCwdSessions().get(targetCwd);
    if (!cr) { res.status(404).json({ error: 'No active session' }); return; }
    try { await cr.session.abort(); res.json({ status: 'aborted' }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/sessions/prompt (legacy - with sessionId in URL)
  app.post('/api/sessions/:id/prompt', async (req: Request, res: Response) => {
    const { text, cwd, images } = req.body;
    if (!text) { res.status(400).json({ error: 'Missing text' }); return; }
    const targetCwd = cwd || process.env.HOME || '/home/manu';
    try {
      const cr = await getOrCreateSessionFn(targetCwd, false, undefined);
      cr.lastPromptMsg = text;
      cr.lastPromptImages = images || null;
      console.log(`🚀 [${targetCwd}] POST prompt: ${text.substring(0, 100)}...`);
      const promptOpts: any = {};
      if (!cr.idle) promptOpts.streamingBehavior = "steer";
      if (images?.length) promptOpts.images = images;
      cr.idle = false;
      cr.session.prompt(text, promptOpts).catch((err: Error) => {
        console.error(`[prompt error] ${targetCwd}: ${err.message}`);
        broadcastToSSEFn(targetCwd, 'error', { message: err.message });
      });
      res.json({ status: 'prompt_sent', cwd: targetCwd });
    } catch (e: any) {
      console.error(`[prompt] Runtime creation failed: ${e.message}`);
      res.status(500).json({ error: `Failed to create session: ${e.message}` });
    }
  });
}