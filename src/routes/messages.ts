// ── Message Routes (REST API) ──
// POST /api/sessions/:id/prompt - Send prompt
// POST /api/sessions/:id/steer - Send steering instruction
// POST /api/sessions/:id/follow_up - Send follow-up message
// POST /api/sessions/:id/abort - Abort current operation

import type { Request, Response } from 'express';
import { cwdSessions, getOrCreateSession } from '../services/sessionManager';
import { broadcastToSSE } from './events';

export function registerMessageRoutes(app: any): void {
  
  // POST /api/sessions/:id/prompt
  app.post('/api/sessions/:id/prompt', async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const { text, cwd, images } = req.body;

    if (!text) {
      res.status(400).json({ error: 'Missing text' });
      return;
    }

    const targetCwd = cwd || process.env.HOME || '/home/manu';

    try {
      const cr = await getOrCreateSession(targetCwd, false, undefined);
      cr.lastPromptMsg = text;
      cr.lastPromptImages = images || null;

      console.log(`🚀 [${targetCwd}] POST prompt: ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}`);

      const promptOpts: any = {};
      if (!cr.idle) {
        promptOpts.streamingBehavior = "steer";
      }
      if (images?.length) {
        promptOpts.images = images;
      }

      cr.idle = false;

      // Start streaming response (will come via SSE)
      cr.session.prompt(text, promptOpts).catch((err: Error) => {
        console.error(`[prompt error] ${targetCwd}: ${err.message}`);
        broadcastToSSE(targetCwd, 'error', { message: err.message });
      });

      // Return immediately - streaming happens via SSE
      res.json({ status: 'prompt_sent', sessionId, cwd: targetCwd });
    } catch (e: any) {
      console.error(`[prompt] Runtime creation failed: ${e.message}`);
      res.status(500).json({ error: `Failed to create session: ${e.message}` });
    }
  });

  // POST /api/sessions/:id/steer
  app.post('/api/sessions/:id/steer', async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const { text, cwd } = req.body;

    if (!text) {
      res.status(400).json({ error: 'Missing text' });
      return;
    }

    const targetCwd = cwd || process.env.HOME || '/home/manu';
    const cr = cwdSessions.get(targetCwd);

    if (!cr) {
      res.status(404).json({ error: 'No active session for this CWD' });
      return;
    }

    try {
      await cr.session.steer(text);
      res.json({ status: 'steer_sent', sessionId });
    } catch (e: any) {
      console.error(`[steer error] ${targetCwd}: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sessions/:id/follow_up
  app.post('/api/sessions/:id/follow_up', async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const { text, cwd } = req.body;

    if (!text) {
      res.status(400).json({ error: 'Missing text' });
      return;
    }

    const targetCwd = cwd || process.env.HOME || '/home/manu';
    const cr = cwdSessions.get(targetCwd);

    if (!cr) {
      res.status(404).json({ error: 'No active session for this CWD' });
      return;
    }

    try {
      await cr.session.followUp(text);
      res.json({ status: 'follow_up_sent', sessionId });
    } catch (e: any) {
      console.error(`[follow_up error] ${targetCwd}: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sessions/:id/abort
  app.post('/api/sessions/:id/abort', async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const { cwd } = req.body;

    const targetCwd = cwd || process.env.HOME || '/home/manu';
    const cr = cwdSessions.get(targetCwd);

    if (!cr) {
      res.status(404).json({ error: 'No active session for this CWD' });
      return;
    }

    try {
      await cr.session.abort();
      res.json({ status: 'aborted', sessionId });
    } catch (e: any) {
      console.error(`[abort error] ${targetCwd}: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });
}