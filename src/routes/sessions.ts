// ── Session Routes (REST API) ──
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { SessionManager } from "@mariozechner/pi-coding-agent";

const HOME = process.env.HOME || '/home/manu';
const SESSIONS_DIR = path.join(HOME, '.pi', 'agent', 'sessions');

function encodeDirName(cwd: string) {
  return '--' + cwd.replace(/^\//, '').replace(/\\/g, '/').replace(/\//g, '-') + '--';
}

function parseSessionFilePath(filePath: string, cwd: string, cwdLabel: string) {
  try {
    const fileName = path.basename(filePath);
    const id = fileName.replace(".jsonl", "").split("_").slice(1).join("_");
    const dm = fileName.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
    const createdAt = dm ? `${dm[1]}T${dm[2]}:${dm[3]}:${dm[4]}Z` : "";
    const lastModified = fs.statSync(filePath).mtimeMs;
    let name: string | null = null, lastMessage: string | null = null, lastMessageType: string | null = null;
    let userMsgCount = 0, assistantMsgCount = 0, model: string | null = null;
    
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        if (e.type === "session" && e.cwd && !cwd) {
          cwd = e.cwd;
        }
        if (e.type === "model_change" && e.modelId && !model) model = e.provider ? `${e.provider}/${e.modelId}` : e.modelId;
        if (e.type === "message" && e.message) {
          if (e.message.role === "user") { 
            userMsgCount++; 
            if (!name) name = e.message.content.substring(0, 80); 
            lastMessage = e.message.content.substring(0, 120); 
            lastMessageType = "user"; 
          } else if (e.message.role === "assistant") { 
            assistantMsgCount++; 
            const t = e.message.content.substring(0, 120); 
            if (t) { lastMessage = t; lastMessageType = "assistant"; } 
            if (!model && e.message.model) model = e.message.model; 
          }
        }
      } catch {}
    }
    return { id, cwd, cwdLabel, createdAt, lastModified, name, messageCount: userMsgCount + assistantMsgCount, lastMessage, lastMessageType, model };
  } catch { return null; }
}

function getSessionsForCwd(cwd: string) {
  const dp = path.join(SESSIONS_DIR, encodeDirName(cwd));
  if (!fs.existsSync(dp)) return [];
  return fs.readdirSync(dp)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => parseSessionFilePath(path.join(dp, f), cwd, cwd.replace(HOME, '~')))
    .filter((s): s is any => s !== null)
    .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
}

function getAllSessions() {
  const sessions: any[] = [];
  if (!fs.existsSync(SESSIONS_DIR)) return sessions;
  for (const entry of fs.readdirSync(SESSIONS_DIR)) {
    const fp = path.join(SESSIONS_DIR, entry);
    if (!fs.statSync(fp).isDirectory()) continue;
    const files = fs.readdirSync(fp).filter(x => x.endsWith('.jsonl'));
    if (files.length === 0) continue;
    const firstFile = path.join(fp, files[0]);
    const firstLine = fs.readFileSync(firstFile, 'utf-8').split('\n')[0];
    try {
      const firstEvent = JSON.parse(firstLine);
      if (firstEvent.type === 'session' && firstEvent.cwd) {
        const cwd = firstEvent.cwd;
        const cwdLabel = cwd.replace(HOME, '~');
        for (const f of files) {
          const info = parseSessionFilePath(path.join(fp, f), cwd, cwdLabel);
          if (info) sessions.push(info);
        }
      }
    } catch {}
  }
  return sessions;
}

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

  // GET /api/cwds - List all project directories
  app.get('/api/cwds', (req, res) => {
    try {
      const allSessions = getAllSessions();
      const cwdMap = new Map<string, { path: string; label: string; sessionCount: number }>();
      for (const s of allSessions) {
        if (!cwdMap.has(s.cwd)) {
          cwdMap.set(s.cwd, { path: s.cwd, label: s.cwdLabel, sessionCount: 0 });
        }
        cwdMap.get(s.cwd)!.sessionCount++;
      }
      res.json(Array.from(cwdMap.values()));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/sessions - List sessions for a CWD
  app.get('/api/sessions', async (req: Request, res: Response) => {
    const cwd = req.query.cwd as string || HOME;
    try {
      const sessions = getSessionsForCwd(cwd);
      res.json(sessions);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sessions - Create new session
  app.post('/api/sessions', async (req: Request, res: Response) => {
    const { cwd } = req.body;
    const targetCwd = cwd || HOME;

    try {
      await disposeSessionFn(targetCwd);
      const sm = await SessionManager.create(targetCwd);
      const cr = await createCwdSessionFn(targetCwd, sm);
      cr.idle = true;

      res.json({
        sessionId: cr.session.sessionId,
        sessionFile: cr.session.sessionFile,
        cwd: cr.cwd,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sessions/load - Load specific session by sessionId in body (MUST be before /:id)
  app.post('/api/sessions/load', async (req: Request, res: Response) => {
    const { sessionId, cwd } = req.body;
    console.log(`[load_session] sessionId=${sessionId}, cwd=${cwd}`);
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }
    const targetCwd = cwd || HOME;

    try {
      const sessionPath = findSessionFileFn(targetCwd, sessionId);
      console.log(`[load_session] sessionPath=${sessionPath}`);
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
      console.log(`[load_session] opening session...`);
      const sm = await SessionManager.open(sessionPath);
      console.log(`[load_session] sm=${typeof sm}`);
      const cr = await createCwdSessionFn(targetCwd, sm);
      console.log(`[load_session] done`);

      res.json({
        sessionId: cr.session.sessionId,
        sessionFile: cr.session.sessionFile,
        isWorking: !cr.idle,
        cwd: targetCwd,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sessions/:id/load - Load specific session by URL param
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
      const sm = await SessionManager.open(sessionPath);
      const cr = await createCwdSessionFn(targetCwd, sm);

      res.json({
        sessionId: cr.session.sessionId,
        sessionFile: cr.session.sessionFile,
        isWorking: !cr.idle,
        cwd: targetCwd,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/sessions/state - Get current state for a CWD
  app.get('/api/sessions/state', async (req: Request, res: Response) => {
    const cwd = req.query.cwd as string || HOME;
    const cr = getCwdSessions().get(cwd);
    if (!cr) {
      res.json({
        isWorking: false,
        sessionId: null,
        cwd,
      });
      return;
    }
    res.json({
      isWorking: !cr.idle,
      sessionId: cr.session.sessionId,
      cwd: cr.cwd,
    });
  });

  // GET /api/sessions/stats - Get stats for a CWD
  app.get('/api/sessions/stats', async (req: Request, res: Response) => {
    const cwd = req.query.cwd as string || HOME;
    const cr = getCwdSessions().get(cwd);
    if (!cr) {
      res.json({
        messageCount: 0,
        tokenCount: 0,
        lastActive: null,
        sessionId: null,
        cwd,
      });
      return;
    }
    res.json({
      messageCount: cr.session.messages.length,
      tokenCount: cr.session.tokensUsed || 0,
      lastActive: cr.session.lastActive || new Date(),
      sessionId: cr.session.sessionId,
      cwd: cr.cwd,
    });
  });

  // GET /api/sessions/:id - Get session messages
  app.get('/api/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
    const cwd = req.query.cwd as string || HOME;
    const cr = getCwdSessions().get(cwd);
    
    if (!cr || cr.session.sessionId !== req.params.id) {
      next();
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

    const dirName = encodeDirName(cwd);
    const sessionDir = path.join(SESSIONS_DIR, dirName);
    
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
      res.status(500).json({ error: e.message });
    }
  });
}