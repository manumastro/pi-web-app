/**
 * OpenChamber SDK Compatibility Routes
 *
 * Bridges the OpenChamber frontend (which uses @opencode-ai/sdk/v2) to Pi Web's
 * backend (session store, runner orchestrator, SSE manager).
 *
 * The OpenChamber SDK expects these URL patterns under /api/:
 *   GET  /session              → list sessions
 *   POST /session              → create session
 *   GET  /session/{id}         → get session
 *   PUT  /session/{id}         → update session
 *   DELETE /session/{id}       → delete session
 *   GET  /session/status       → session status map
 *   GET  /session/{id}/message → list messages
 *   POST /session/{id}/prompt_async → send prompt
 *   POST /session/{id}/abort   → abort session
 *   GET  /global/event         → SSE stream (global events)
 *   GET  /path                 → current path
 *   GET  /project              → list projects
 *   GET  /project/current      → current project
 *   GET  /config               → config
 *   GET  /global/config        → global config
 *   GET  /provider             → list providers
 *   GET  /provider/auth        → provider auth
 *   GET  /agent                → list agents
 *   GET  /command              → list commands
 *   GET  /file                 → list files
 *   GET  /file/content         → read file
 *   GET  /vcs                  → VCS info
 *   GET  /config/providers     → config providers
 *   GET  /mcp                  → MCP status
 *   GET  /lsp                  → LSP status
 *   GET  /experimental/session → experimental session list
 *   GET  /question             → questions
 *   GET  /permission           → permissions
 *   POST /log                  → app log
 *   GET  /session-folders      → session folders
 *   POST /session-folders      → save session folders
 *   GET  /git/check            → git check
 *   GET  /git/status           → git status
 *   GET  /git/branches         → git branches
 *   GET  /fs/list              → filesystem list
 *   GET  /fs/read              → filesystem read
 *   POST /fs/exec              → filesystem exec
 *   GET  /config/themes        → themes
 *   GET  /github/auth/status   → github auth
 *   GET  /relay/status         → relay status
 */

import type { Express, Request, Response } from 'express';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';
import type { SessionStore, Session } from '../sessions/store.js';
import type { SseManager } from '../sse/manager.js';
import type { SseEvent } from '../events.js';
import type { Config } from '../config/index.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Type mappings: Pi Web → OpenChamber SDK shape
// ---------------------------------------------------------------------------

interface OcSession {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  version: string;
  time: { created: number; updated: number; compacting?: number };
  parentID?: string;
  summary?: { additions: number; deletions: number; files: number; diffs?: Array<Record<string, unknown>> };
  share?: { url: string };
  revert?: { messageID: string; partID?: string; snapshot?: string; diff?: string };
}

interface OcMessageInfo {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  time: { created: number };
  error?: unknown;
  modelID?: string;
  providerID?: string;
  mode?: string;
  cost?: number;
  tokens?: { input: number; output: number; reasoning: number; cache?: { read: number; write: number } };
}

interface OcPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface OcMessageWithParts {
  info: OcMessageInfo;
  parts: OcPart[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toOcSession(session: Session, projectId = 'pi-web-project'): OcSession {
  const title = session.title || 'Session';
  return {
    id: session.id,
    slug: session.id,
    projectID: projectId,
    directory: session.cwd,
    title,
    version: '1',
    time: {
      created: new Date(session.createdAt).getTime(),
      updated: new Date(session.updatedAt).getTime(),
    },
  };
}

function toOcMessageInfo(sessionId: string, msg: Session['messages'][0]): OcMessageInfo {
  return {
    id: msg.id,
    sessionID: sessionId,
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    time: { created: new Date(msg.timestamp).getTime() },
  };
}

function toOcParts(sessionId: string, msg: Session['messages'][0]): OcPart[] {
  const parts: OcPart[] = [];

  // Main text/content part
  if (msg.content) {
    const partType = msg.role === 'tool_call' ? 'tool' : msg.role === 'tool_result' ? 'tool' : 'text';
    parts.push({
      id: `${msg.id}-text`,
      sessionID: sessionId,
      messageID: msg.id,
      type: partType,
      text: msg.content,
    });
  }

  return parts;
}

function toOcMessages(sessionId: string, messages: Session['messages']): OcMessageWithParts[] {
  // Group messages: each user message starts a turn, assistant/tool messages belong to the same turn
  const grouped: OcMessageWithParts[] = [];
  let currentUser: OcMessageWithParts | null = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (currentUser) grouped.push(currentUser);
      currentUser = {
        info: toOcMessageInfo(sessionId, msg),
        parts: toOcParts(sessionId, msg),
      };
    } else if (msg.role === 'assistant') {
      // In Pi Web, assistant messages are stored separately from user
      const assistantMsg: OcMessageWithParts = {
        info: toOcMessageInfo(sessionId, msg),
        parts: toOcParts(sessionId, msg),
      };
      grouped.push(assistantMsg);
    } else {
      // tool_call / tool_result — attach to last assistant message
      if (grouped.length > 0) {
        const last = grouped[grouped.length - 1]!;
        if (last.info.role === 'assistant') {
          last.parts.push(...toOcParts(sessionId, msg));
        }
      }
    }
  }
  if (currentUser) grouped.push(currentUser);

  return grouped;
}

function toOcSessionStatus(status: Session['status']): { type: 'idle' | 'busy' | 'retry' } {
  switch (status) {
    case 'busy':
    case 'prompting':
    case 'answering':
    case 'waiting_question':
    case 'waiting_permission':
      return { type: 'busy' };
    case 'retry':
      return { type: 'retry' };
    default:
      return { type: 'idle' };
  }
}

// ---------------------------------------------------------------------------
// SSE Bridge: convert Pi Web events to OpenChamber global events
// ---------------------------------------------------------------------------

interface OcGlobalEvent {
  type: string;
  properties: Record<string, unknown>;
}

function convertToOcEvent(event: SseEvent, sessionStore: SessionStore): OcGlobalEvent | null {
  switch (event.type) {
    case 'text_chunk': {
      // Emit as message.part.updated with delta
      const session = sessionStore.getSession(event.sessionId);
      const providerId = session?.model?.split('/')[0] ?? 'unknown';
      const modelId = session?.model?.split('/').slice(1).join('/') ?? 'unknown';
      return {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `${event.messageId}-text`,
            sessionID: event.sessionId,
            messageID: event.messageId,
            type: 'text',
            text: event.content,
          },
          delta: event.content,
        },
      };
    }
    case 'thinking': {
      return {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `${event.messageId}-reasoning`,
            sessionID: event.sessionId,
            messageID: event.messageId,
            type: 'reasoning',
            text: event.content,
            time: { start: Date.now() },
          },
          delta: event.content,
        },
      };
    }
    case 'tool_call': {
      return {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `${event.messageId}-${event.toolCallId}`,
            sessionID: event.sessionId,
            messageID: event.messageId,
            type: 'tool',
            callID: event.toolCallId,
            tool: event.toolName,
            state: { status: 'running', input: event.input, time: { start: Date.now() } },
          },
        },
      };
    }
    case 'tool_result': {
      return {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `${event.messageId}-${event.toolCallId}`,
            sessionID: event.sessionId,
            messageID: event.messageId,
            type: 'tool',
            callID: event.toolCallId,
            tool: '',
            state: {
              status: event.success ? 'completed' : 'error',
              input: {},
              output: event.result,
              title: '',
              ...(event.success
                ? { time: { start: Date.now() - 1000, end: Date.now() } }
                : { error: event.result, time: { start: Date.now() - 1000, end: Date.now() } }),
            },
          },
        },
      };
    }
    case 'status': {
      const ocStatus = toOcSessionStatus(event.status as Session['status']);
      return {
        type: 'session.status',
        properties: {
          sessionID: event.sessionId,
          status: ocStatus,
        },
      };
    }
    case 'done': {
      return {
        type: 'session.idle',
        properties: {
          sessionID: event.sessionId,
        },
      };
    }
    case 'session_name': {
      const session = sessionStore.getSession(event.sessionId);
      if (session) {
        return {
          type: 'session.updated',
          properties: {
            info: toOcSession(session),
          },
        };
      }
      return null;
    }
    case 'error': {
      return {
        type: 'session.error',
        properties: {
          sessionID: event.sessionId,
          error: {
            name: 'UnknownError',
            data: { message: event.message },
          },
        },
      };
    }
    case 'question': {
      return {
        type: 'permission.updated',
        properties: {
          id: event.questionId,
          type: 'question',
          sessionID: event.sessionId,
          messageID: event.messageId,
          title: event.question,
          time: { created: Date.now() },
          metadata: { options: event.options ?? [] },
        },
      };
    }
    case 'permission': {
      return {
        type: 'permission.updated',
        properties: {
          id: event.permissionId,
          type: event.action,
          sessionID: event.sessionId,
          messageID: event.messageId,
          title: event.resource,
          time: { created: Date.now() },
          metadata: {},
        },
      };
    }
    default:
      return null;
  }
}

// ── Global event SSE clients ──────────────────────────────────────────────
interface GlobalSseClient {
  id: string;
  response: Response;
}

let globalEventCounter = 0;

function writeGlobalSse(response: Response, id: number, data: unknown): void {
  response.write(`id: ${id}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Express v5 query helper (req.query values are string | string[] | undefined)
// ---------------------------------------------------------------------------

function queryStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  return '';
}

function paramStr(value: unknown): string {
  return queryStr(value);
}

// ---------------------------------------------------------------------------
// Route installer
// ---------------------------------------------------------------------------

export function installOpenChamberRoutes(
  app: Express,
  params: {
    runner: RunnerOrchestrator;
    sessionStore: SessionStore;
    sseManager: SseManager;
    config: Config;
  },
): void {
  console.log('INSTALLING OpenChamber routes...');
  const { runner, sessionStore, sseManager, config } = params;

  // ── Global SSE clients tracking ──────────────────────────────────────
  const globalClients = new Map<string, GlobalSseClient>();

  // Bridge Pi Web SSE events to OpenChamber global SSE
  const unsubSse = sseManager.observe((event: SseEvent) => {
    const ocEvent = convertToOcEvent(event, sessionStore);
    if (!ocEvent) return;

    const id = ++globalEventCounter;
    for (const client of globalClients.values()) {
      writeGlobalSse(client.response, id, ocEvent);
    }
  });

  // ── Session CRUD ─────────────────────────────────────────────────────

  // GET /api/session — list sessions
  app.get('/api/session', (req: Request, res: Response) => {
    const rawDirectory = typeof req.query.directory === 'string' ? req.query.directory.trim() : '';
    const normalizedDirectory = rawDirectory.replace(/[\\/]+$/, '');
    const allSessions = sessionStore.listSessions();
    const sessions = !normalizedDirectory || normalizedDirectory === '/'
      ? allSessions
      : allSessions.filter((s) => {
          const cwd = (s.cwd || '').replace(/[\\/]+$/, '');
          return cwd === normalizedDirectory || cwd.startsWith(`${normalizedDirectory}/`);
        });
    res.json(sessions.map((s) => toOcSession(s)));
  });

  // POST /api/session — create session
  app.post('/api/session', (req: Request, res: Response) => {
    const directory = typeof req.query.directory === 'string'
      ? req.query.directory.trim()
      : typeof req.body?.directory === 'string'
        ? req.body.directory.trim()
        : config.homeDir;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const parentID = typeof req.body?.parentID === 'string' ? req.body.parentID : undefined;

    try {
      const session = sessionStore.createSession(directory, undefined);
      if (title) {
        sessionStore.updateSession(session.id, { title });
      }
      const finalSession = sessionStore.getSession(session.id) ?? session;

      // Emit session.created event via global SSE
      const createdEvent = {
        type: 'session.created',
        properties: { info: toOcSession(finalSession) },
      };
      const id = ++globalEventCounter;
      for (const client of globalClients.values()) {
        writeGlobalSse(client.response, id, createdEvent);
      }

      res.json(toOcSession(finalSession));
    } catch (err) {
      res.status(400).json({ error: 'Failed to create session', message: String(err) });
    }
  });

  // GET /api/session/status — session statuses (map of sessionId → status)
  app.get('/api/session/status', (req: Request, res: Response) => {
    const rawDirectory = typeof req.query.directory === 'string' ? req.query.directory.trim() : '';
    const normalizedDirectory = rawDirectory.replace(/[\\/]+$/, '');
    const allSessions = sessionStore.listSessions();
    const sessions = !normalizedDirectory || normalizedDirectory === '/'
      ? allSessions
      : allSessions.filter((s) => {
          const cwd = (s.cwd || '').replace(/[\\/]+$/, '');
          return cwd === normalizedDirectory || cwd.startsWith(`${normalizedDirectory}/`);
        });

    const payload: Record<string, { type: 'idle' | 'busy' | 'retry' }> = {};
    for (const session of sessions) {
      payload[session.id] = toOcSessionStatus(session.status);
    }
    res.json(payload);
  });

  // GET /api/session/:sessionId — get session
  app.get('/api/session/:sessionId', (req: Request, res: Response) => {
    const session = sessionStore.getSession(paramStr(req.params.sessionId));
    if (!session) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    res.json(toOcSession(session));
  });

  // PUT /api/session/:sessionId — update session (title)
  app.put('/api/session/:sessionId', (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const updated = sessionStore.updateSession(sessionId, { title });
    if (!updated) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    // Emit session.updated event
    const updateEvent = {
      type: 'session.updated',
      properties: { info: toOcSession(updated) },
    };
    const id = ++globalEventCounter;
    for (const client of globalClients.values()) {
      writeGlobalSse(client.response, id, updateEvent);
    }
    res.json(toOcSession(updated));
  });

  // DELETE /api/session/:sessionId — delete session
  app.delete('/api/session/:sessionId', (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const sessionSnapshot = toOcSession(session);
    const deleted = sessionStore.deleteSession(sessionId);
    if (!deleted) {
      res.status(500).json({ error: 'Failed to delete session' });
      return;
    }
    // Emit session.deleted event
    const deleteEvent = {
      type: 'session.deleted',
      properties: { info: sessionSnapshot },
    };
    const id = ++globalEventCounter;
    for (const client of globalClients.values()) {
      writeGlobalSse(client.response, id, deleteEvent);
    }
    res.json(true);
  });

  // ── Messages ─────────────────────────────────────────────────────────

  // GET /api/session/:sessionId/message — list messages
  app.get('/api/session/:sessionId/message', (req: Request, res: Response) => {
    const session = sessionStore.getSession(paramStr(req.params.sessionId));
    if (!session) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    const messages = toOcMessages(session.id, session.messages);
    res.json(messages);
  });

  // GET /api/session/:sessionId/message/:messageId — get single message
  app.get('/api/session/:sessionId/message/:messageId', (req: Request, res: Response) => {
    const session = sessionStore.getSession(paramStr(req.params.sessionId));
    if (!session) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    const msg = session.messages.find((m) => m.id === paramStr(req.params.messageId));
    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json({
      info: toOcMessageInfo(session.id, msg),
      parts: toOcParts(session.id, msg),
    });
  });

  // POST /api/session/:sessionId/prompt_async — send prompt (async)
  app.post('/api/session/:sessionId/prompt_async', async (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const parts = Array.isArray(req.body?.parts) ? req.body.parts : [];
    const textPart = parts.find((p: Record<string, unknown>) => p.type === 'text');
    const message = typeof textPart?.text === 'string' ? textPart.text.trim() : '';
    const model = req.body?.model;
    const modelKey = model ? `${model.providerID}/${model.modelID}` : undefined;
    const messageId = typeof req.body?.messageID === 'string' ? req.body.messageID : undefined;
    const agent = typeof req.body?.agent === 'string' ? req.body.agent : undefined;

    if (!message) {
      res.status(400).json({ error: 'Text part is required' });
      return;
    }

    try {
      // Check for image/file attachments
      const fileParts = parts.filter((p: Record<string, unknown>) => p.type === 'file');
      const imagePaths: string[] = [];

      let promptMessage = message;
      if (fileParts.length > 0) {
        const header = 'Use the read tool to inspect these image files when needed:';
        const lines = fileParts.map((fp: Record<string, unknown>) => {
          const url = typeof fp.url === 'string' ? fp.url : '';
          const filename = typeof fp.filename === 'string' ? fp.filename : 'image';
          // Convert data: URLs to temp files if needed
          if (url.startsWith('data:')) {
            // For now, include the filename as reference
            return `- [uploaded] ${filename}`;
          }
          return `- ${url || filename}`;
        });
        promptMessage = `${message}\n\n${header}\n${lines.join('\n')}`;
      }

      // Note: The runner.prompt() call below already stores the user message
      // and handles session status updates, so we don't duplicate here.

      // Set model if provided
      if (modelKey) {
        sessionStore.updateSession(sessionId, { model: modelKey });
      }

      // Update session status to busy
      sessionStore.updateSession(sessionId, { status: 'busy' });

      // Emit session.status via global SSE
      const statusEvent = {
        type: 'session.status',
        properties: {
          sessionID: sessionId,
          status: { type: 'busy' },
        },
      };
      const evtId = ++globalEventCounter;
      for (const client of globalClients.values()) {
        writeGlobalSse(client.response, evtId, statusEvent);
      }

      // Start runner prompt (fire and forget)
      runner.prompt({
        sessionId,
        cwd: session.cwd,
        message: promptMessage,
        displayMessage: message,
        ...(modelKey !== undefined ? { model: modelKey } : {}),
        ...(messageId ? { messageId } : {}),
      }).catch((err) => {
        console.error(`[openchamber] prompt async failed for session ${sessionId}:`, err);
        sessionStore.updateSession(sessionId, { status: 'error' });
        const errorEvent = {
          type: 'session.error',
          properties: {
            sessionID: sessionId,
            error: {
              name: 'UnknownError',
              data: { message: err instanceof Error ? err.message : String(err) },
            },
          },
        };
        const errId = ++globalEventCounter;
        for (const client of globalClients.values()) {
          writeGlobalSse(client.response, errId, errorEvent);
        }
      });

      // Acknowledge immediately (204)
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'Failed to send prompt', message: String(err) });
    }
  });

  // POST /api/session/:sessionId/abort — abort session
  app.post('/api/session/:sessionId/abort', async (req: Request, res: Response) => {
    const sessionId = paramStr(req.params.sessionId);
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      await runner.abort(sessionId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Global SSE Event Stream ──────────────────────────────────────────

  app.get('/api/global/event', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client: GlobalSseClient = { id: clientId, response: res };
    globalClients.set(clientId, client);

    // Send server.connected event
    writeGlobalSse(res, ++globalEventCounter, {
      type: 'server.connected',
      properties: {
        directory: config.homeDir,
        version: '1.0.0',
      },
    });

    // Heartbeat every 20s
    const heartbeat = setInterval(() => {
      writeGlobalSse(res, ++globalEventCounter, {
        type: 'openchamber:heartbeat',
        properties: { at: Date.now() },
      });
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      globalClients.delete(clientId);
    });
  });

  // Also support the legacy /api/openchamber/events path
  app.get('/api/openchamber/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'openchamber:event-stream-ready', properties: {} })}\n\n`);
    const interval = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'openchamber:heartbeat', properties: { at: Date.now() } })}\n\n`);
    }, 20000);

    req.on('close', () => clearInterval(interval));
  });

  // ── Path / Project / Config ──────────────────────────────────────────

  app.get('/api/path', (req: Request, res: Response) => {
    const directory = queryStr(req.query.directory).trim() || config.homeDir;
    res.json({ path: directory });
  });

  app.get('/api/project', (req: Request, res: Response) => {
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

  app.get('/api/project/current', (req: Request, res: Response) => {
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

  app.get('/api/config', (req: Request, res: Response) => {
    res.json({
      homeDirectory: config.homeDir,
      homeDir: config.homeDir,
      directory: config.homeDir,
      version: '1.0.0',
      platform: os.platform(),
    });
  });

  app.get('/api/config/settings', (_req: Request, res: Response) => {
    // Return settings in OpenChamber format
    res.json({
      version: '1.0.0',
      settings: {
        // Add any settings the frontend might need
        theme: 'system',
        language: 'en',
      },
    });
  });

  app.get('/api/global/config', (_req: Request, res: Response) => {
    res.json({
      homeDirectory: config.homeDir,
      version: '1.0.0',
    });
  });

  app.get('/api/fs/home', (req: Request, res: Response) => {
    console.log('HANDLING /api/fs/home');
    // Redirect to /api/fs/list with home path
    const homePath = config.homeDir;
    try {
      const names = fs.readdirSync(homePath);
      const entries = names.map((name) => {
        const fullPath = path.join(homePath, name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            name,
            path: fullPath,
            isDirectory: stat.isDirectory(),
            isFile: stat.isFile(),
            isSymbolicLink: stat.isSymbolicLink(),
          };
        } catch {
          return { name, path: fullPath, isDirectory: false, isFile: false, isSymbolicLink: false };
        }
      });
      res.json({ entries });
    } catch {
      res.status(404).json({ error: 'Not Found' });
    }
  });

  // ── Experimental session list ────────────────────────────────────────

  app.get('/api/experimental/session', (req: Request, res: Response) => {
    const rawDirectory = queryStr(req.query.directory).trim();
    const normalizedDirectory = rawDirectory.replace(/[\\/]+$/, '');
    const archived = req.query.archived === 'true';
    const limit = parseInt(queryStr(req.query.limit)) || 200;
    
    let sessions = sessionStore.listSessions();
    
    // Filter by directory if specified
    if (normalizedDirectory && normalizedDirectory !== '/') {
      sessions = sessions.filter((s) => {
        const cwd = (s.cwd || '').replace(/[\\/]+$/, '');
        return cwd === normalizedDirectory || cwd.startsWith(`${normalizedDirectory}/`);
      });
    }
    
    // Apply limit
    sessions = sessions.slice(0, limit);
    
    res.json(sessions.map((s) => toOcSession(s)));
  });

  // ── Provider / Agent / Command ───────────────────────────────────────

  // ── Providers (populated from runner model list) ──────────────────────

  app.get('/api/provider', async (_req: Request, res: Response) => {
    console.log('HANDLING /api/provider');
    try {
      const models = await runner.listModels();
      // Group models by provider
      const providerMap = new Map<string, {
        id: string;
        name: string;
        source: string;
        env: string[];
        options: Record<string, unknown>;
        models: unknown[];
      }>();

      for (const m of models) {
        if (!providerMap.has(m.provider)) {
          providerMap.set(m.provider, {
            id: m.provider,
            name: m.provider,
            source: 'config',
            env: [],
            options: {},
            models: [],
          });
        }
        const provider = providerMap.get(m.provider)!;
        provider.models.push({
          id: m.id,
          providerID: m.provider,
          api: { id: m.provider, url: '', npm: '' },
          name: m.name,
          capabilities: {
            temperature: true,
            reasoning: m.reasoning,
            attachment: m.input.includes('image'),
            toolcall: true,
            input: {
              text: m.input.includes('text'),
              audio: false,
              image: m.input.includes('image'),
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            context: m.contextWindow,
            maxTokens: m.maxTokens,
          },
        });
      }

      const all = Array.from(providerMap.values());
      res.json({ all, default: {}, connected: all });
    } catch {
      res.json({ all: [], default: {}, connected: [] });
    }
  });

  app.get('/api/provider/auth', (_req: Request, res: Response) => {
    res.json({});
  });

  app.get('/api/config/providers', async (_req: Request, res: Response) => {
    console.log('HANDLING /api/config/providers', _req.query);
    try {
      const models = await runner.listModels();
      const providerMap = new Map<string, {
        id: string;
        name: string;
        source: string;
        env: string[];
        options: Record<string, unknown>;
        models: unknown[];
      }>();

      for (const m of models) {
        if (!providerMap.has(m.provider)) {
          providerMap.set(m.provider, {
            id: m.provider,
            name: m.provider,
            source: 'config',
            env: [],
            options: {},
            models: [],
          });
        }
        const provider = providerMap.get(m.provider)!;
        provider.models.push({
          id: m.id,
          providerID: m.provider,
          api: { id: m.provider, url: '', npm: '' },
          name: m.name,
          capabilities: {
            temperature: true,
            reasoning: m.reasoning,
            attachment: m.input.includes('image'),
            toolcall: true,
            input: {
              text: m.input.includes('text'),
              audio: false,
              image: m.input.includes('image'),
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            context: m.contextWindow,
            maxTokens: m.maxTokens,
          },
        });
      }

      const all = Array.from(providerMap.values());
      res.json({ providers: all, default: {} });
    } catch {
      res.json({ providers: [], default: {} });
    }
  });

  // ── Model listing (flat list) ──────────────────────────────────────────

  app.get('/api/models', async (_req: Request, res: Response) => {
    try {
      const models = await runner.listModels();
      const ocModels = models.map((m) => ({
        id: m.key,
        providerID: m.provider,
        modelID: m.id,
        name: m.name,
        available: m.available,
        authConfigured: m.authConfigured,
        reasoning: m.reasoning,
        input: m.input,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        isSelected: m.isSelected,
      }));
      res.json({ models: ocModels });
    } catch {
      res.json({ models: [] });
    }
  });

  app.get('/api/agent', (_req: Request, res: Response) => {
    res.json([]);
  });

  app.get('/api/command', (_req: Request, res: Response) => {
    res.json([]);
  });

  // ── File operations ─────────────────────────────────────────────────

  app.get('/api/file', (req: Request, res: Response) => {
    const requestedPath = queryStr(req.query.path).trim() || config.homeDir;
    try {
      const names = fs.readdirSync(requestedPath);
      const entries = names.map((name) => {
        const fullPath = path.join(requestedPath, name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            name,
            path: fullPath,
            isDirectory: stat.isDirectory(),
            isFile: stat.isFile(),
            isSymbolicLink: stat.isSymbolicLink(),
          };
        } catch {
          return { name, path: fullPath, isDirectory: false, isFile: false, isSymbolicLink: false };
        }
      });
      res.json({ entries });
    } catch {
      res.status(404).json({ error: 'Not Found' });
    }
  });

  app.get('/api/file/content', (req: Request, res: Response) => {
    const targetPath = queryStr(req.query.path);
    if (!targetPath) {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    try {
      const content = fs.readFileSync(targetPath, 'utf8');
      res.json({ path: targetPath, content });
    } catch {
      res.json({ path: targetPath, content: '' });
    }
  });

  // ── VCS / Git ────────────────────────────────────────────────────────

  app.get('/api/vcs', (_req: Request, res: Response) => {
    res.json({ type: 'git', branch: null, remote: null });
  });

  app.get('/api/git/check', (_req: Request, res: Response) => {
    res.json({ isGitRepository: false });
  });

  app.get('/api/git/status', (_req: Request, res: Response) => {
    res.json({ branch: null, files: [], ahead: 0, behind: 0, clean: true });
  });

  app.get('/api/git/branches', (_req: Request, res: Response) => {
    res.json({ branches: [] });
  });

  // Additional Git endpoints needed by the frontend
  app.get('/api/git/worktrees/bootstrap-status', (req: Request, res: Response) => {
    const directory = queryStr(req.query.directory) || config.homeDir;
    res.json({ bootstrapped: false, directory });
  });

  app.get('/api/git/identities', (_req: Request, res: Response) => {
    res.json([]);
  });

  app.get('/api/git/global-identity', (_req: Request, res: Response) => {
    res.json({ name: '', email: '', hasGlobalIdentity: false });
  });

  // ── FS operations (compat) ───────────────────────────────────────────

  app.get('/api/fs/list', (req: Request, res: Response) => {
    const requestedPath = queryStr(req.query.path).trim() || config.homeDir;
    try {
      const names = fs.readdirSync(requestedPath);
      const entries = names.map((name) => {
        const fullPath = path.join(requestedPath, name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            name,
            path: fullPath,
            isDirectory: stat.isDirectory(),
            isFile: stat.isFile(),
            isSymbolicLink: stat.isSymbolicLink(),
          };
        } catch {
          return { name, path: fullPath, isDirectory: false, isFile: false, isSymbolicLink: false };
        }
      });
      res.json({ entries });
    } catch {
      res.status(404).json({ error: 'Not Found' });
    }
  });

  app.get('/api/fs/read', (req: Request, res: Response) => {
    const targetPath = queryStr(req.query.path);
    if (!targetPath) {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    try {
      const content = fs.readFileSync(targetPath, 'utf8');
      res.json({ path: targetPath, content });
    } catch {
      res.json({ path: targetPath, content: '' });
    }
  });

  app.post('/api/fs/exec', (_req: Request, res: Response) => {
    res.json({ code: 0, stdout: '', stderr: '' });
  });

  // ── Various stubs ────────────────────────────────────────────────────

  app.get('/api/config/themes', (_req: Request, res: Response) => {
    res.json({ themes: [] });
  });

  app.get('/api/github/auth/status', (_req: Request, res: Response) => {
    res.json({ authenticated: false });
  });

  app.get('/api/session-folders', (_req: Request, res: Response) => {
    res.json({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: Date.now() });
  });

  app.post('/api/session-folders', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/mcp', (_req: Request, res: Response) => {
    res.json({});
  });

  app.get('/api/lsp', (_req: Request, res: Response) => {
    res.json({});
  });

  app.get('/api/question', (_req: Request, res: Response) => {
    res.json([]);
  });

  app.get('/api/permission', (_req: Request, res: Response) => {
    res.json([]);
  });

  app.post('/api/log', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/relay/status', (_req: Request, res: Response) => {
    res.json({
      viewers: 0,
      sessions: {},
      transport: 'websocket',
      path: '/api/relay',
    });
  });

  app.post('/api/projects/:projectId/icon/discover', (_req: Request, res: Response) => {
    res.json({ icon: null, color: null });
  });

  // ── OpenChamber-specific stubs ───────────────────────────────────────

  app.get('/api/openchamber/models-metadata', (_req: Request, res: Response) => {
    res.json({ models: [] });
  });

  app.get('/api/openchamber/update-check', (_req: Request, res: Response) => {
    res.json({ updateAvailable: false });
  });
}
