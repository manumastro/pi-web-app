import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'crypto';
import { normalizeSessionStatus, type Session, type Message, type SessionStatus } from './store.js';

interface SessionMetaRecord {
  type: 'session';
  id: string;
  cwd: string;
  title?: string;
  model?: string;
  thinkingLevel?: Session['thinkingLevel'];
  piSessionId?: string;
  piSessionFile?: string;
  status?: SessionStatus;
  statusMessage?: string;
  statusMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface MessageRecord {
  type: 'message';
  id: string;
  role: Message['role'];
  content: string;
  timestamp: string;
  messageId?: string;
  toolName?: string;
  toolCallId?: string;
  success?: boolean;
  stopReason?: string;
  errorMessage?: string;
  attachments?: Message['attachments'];
}

type SessionRecord = SessionMetaRecord | MessageRecord;

export interface SessionFileSnapshot {
  session: Session;
  filePath: string;
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Encodes a cwd path to the Pi CLI directory name format.
 * E.g. "/home/manu/pi-web-app" → "--home-manu-pi-web-app--"
 */
function encodeCwdToDirName(cwd: string): string {
  const stripped = cwd.startsWith('/') ? cwd.slice(1) : cwd;
  return `--${stripped.replace(/\//g, '-')}--`;
}

/**
 * Formats an ISO timestamp for CLI-style filename.
 * E.g. "2026-04-30T14:57:14.000Z" → "2026-04-30T14-57-14-000Z"
 */
function formatTimestampForFilename(iso: string): string {
  return iso.replace(/:/g, '-');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractTextContent).filter(Boolean).join('');
  }

  if (isRecord(value)) {
    for (const key of ['text', 'content', 'message', 'value']) {
      const nested = value[key];
      if (typeof nested === 'string') {
        return nested;
      }
      if (Array.isArray(nested) || isRecord(nested)) {
        const extracted = extractTextContent(nested);
        if (extracted) return extracted;
      }
    }
  }

  return '';
}

function parseMessageRecord(parsed: unknown): Message | undefined {
  if (!isRecord(parsed) || parsed.type !== 'message') {
    return undefined;
  }

  const rawMessage = isRecord(parsed.message) ? parsed.message : parsed;
  const id = typeof rawMessage.id === 'string' ? rawMessage.id : typeof parsed.id === 'string' ? parsed.id : undefined;
  const role = typeof rawMessage.role === 'string' ? rawMessage.role : typeof parsed.role === 'string' ? parsed.role : undefined;
  const timestamp = typeof rawMessage.timestamp === 'string' ? rawMessage.timestamp : typeof parsed.timestamp === 'string' ? parsed.timestamp : undefined;

  if (!id || !role || !timestamp) {
    return undefined;
  }

  const content = extractTextContent(rawMessage.content ?? parsed.content);
  const record: Message = {
    id,
    role: role as Message['role'],
    content,
    timestamp,
  };

  const messageId = typeof rawMessage.messageId === 'string' ? rawMessage.messageId : typeof parsed.messageId === 'string' ? parsed.messageId : undefined;
  const toolName = typeof rawMessage.toolName === 'string' ? rawMessage.toolName : typeof parsed.toolName === 'string' ? parsed.toolName : undefined;
  const toolCallId = typeof rawMessage.toolCallId === 'string' ? rawMessage.toolCallId : typeof parsed.toolCallId === 'string' ? parsed.toolCallId : undefined;
  const success = typeof rawMessage.success === 'boolean' ? rawMessage.success : typeof parsed.success === 'boolean' ? parsed.success : undefined;
  const stopReason = typeof rawMessage.stopReason === 'string' ? rawMessage.stopReason : typeof parsed.stopReason === 'string' ? parsed.stopReason : undefined;
  const errorMessage = typeof rawMessage.errorMessage === 'string' ? rawMessage.errorMessage : typeof parsed.errorMessage === 'string' ? parsed.errorMessage : undefined;
  const error = typeof rawMessage.error === 'string' ? rawMessage.error : typeof parsed.error === 'string' ? parsed.error : undefined;
  const attachments = Array.isArray(rawMessage.attachments)
    ? rawMessage.attachments
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const uploadId = typeof (entry as { uploadId?: unknown }).uploadId === 'string' ? (entry as { uploadId: string }).uploadId : '';
          const fileName = typeof (entry as { fileName?: unknown }).fileName === 'string' ? (entry as { fileName: string }).fileName : '';
          const mimeType = typeof (entry as { mimeType?: unknown }).mimeType === 'string' ? (entry as { mimeType: string }).mimeType : '';
          const size = typeof (entry as { size?: unknown }).size === 'number' ? (entry as { size: number }).size : NaN;
          return uploadId && fileName && mimeType && Number.isFinite(size)
            ? { uploadId, fileName, mimeType, size }
            : null;
        })
        .filter((entry): entry is NonNullable<Message['attachments']>[number] => entry !== null)
    : undefined;

  if (messageId !== undefined) record.messageId = messageId;
  if (toolName !== undefined) record.toolName = toolName;
  if (toolCallId !== undefined) record.toolCallId = toolCallId;
  if (success !== undefined) record.success = success;
  if (stopReason !== undefined) record.stopReason = stopReason;
  if (errorMessage !== undefined) record.errorMessage = errorMessage;
  if (attachments !== undefined) record.attachments = attachments;
  if (error !== undefined && record.errorMessage === undefined) record.errorMessage = error;

  return record;
}

function deriveStatus(messages: Message[], metaStatus?: SessionStatus): SessionStatus {
  if (metaStatus !== undefined) {
    return normalizeSessionStatus(metaStatus);
  }

  const hasAssistantError = [...messages].reverse().some((message) => message.role === 'assistant' && (message.stopReason === 'error' || typeof message.errorMessage === 'string'));
  if (hasAssistantError) {
    return 'error';
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === 'user' || lastMessage?.role === 'tool_call') {
    return 'busy';
  }

  return 'idle';
}

export function getSessionFilePath(sessionsDir: string, sessionId: string, cwd?: string, createdAt?: string): string {
  if (cwd) {
    // Save in CLI-style subdirectory with timestamp naming
    const dirName = encodeCwdToDirName(cwd);
    const timestamp = createdAt ? `${formatTimestampForFilename(createdAt)}_` : '';
    return path.join(sessionsDir, dirName, `${timestamp}${sanitizeSessionId(sessionId)}.jsonl`);
  }
  // Fall back to root location (backward compat)
  return path.join(sessionsDir, `${sanitizeSessionId(sessionId)}.jsonl`);
}

export function sessionToJsonl(session: Session): string {
  const records: SessionRecord[] = [
    {
      type: 'session',
      id: session.id,
      cwd: session.cwd,
      ...(session.title !== undefined ? { title: session.title } : {}),
      ...(session.model !== undefined ? { model: session.model } : {}),
      ...(session.thinkingLevel !== undefined ? { thinkingLevel: session.thinkingLevel } : {}),
      ...(session.piSessionId !== undefined ? { piSessionId: session.piSessionId } : {}),
      ...(session.piSessionFile !== undefined ? { piSessionFile: session.piSessionFile } : {}),
      status: normalizeSessionStatus(session.status),
      ...(session.statusMessage !== undefined ? { statusMessage: session.statusMessage } : {}),
      ...(session.statusMetadata !== undefined ? { statusMetadata: session.statusMetadata } : {}),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    ...session.messages.map<MessageRecord>((message) => {
      const record: MessageRecord = {
        type: 'message',
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
      };
      if (message.messageId !== undefined) record.messageId = message.messageId;
      if (message.toolName !== undefined) record.toolName = message.toolName;
      if (message.toolCallId !== undefined) record.toolCallId = message.toolCallId;
      if (message.success !== undefined) record.success = message.success;
      if (message.stopReason !== undefined) record.stopReason = message.stopReason;
      if (message.errorMessage !== undefined) record.errorMessage = message.errorMessage;
      if (message.attachments !== undefined) record.attachments = message.attachments;
      return record;
    }),
  ];

  return records.map((record) => JSON.stringify(record)).join('\n');
}

export function parseSessionJsonl(input: string): Session | undefined {
  if (!input.trim()) {
    return undefined;
  }

  let meta: SessionMetaRecord | undefined;
  const messages: Message[] = [];

  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed) && parsed.type === 'session') {
        const id = typeof parsed.id === 'string' ? parsed.id : '';
        const cwd = typeof parsed.cwd === 'string' ? parsed.cwd : '';
        const title = typeof parsed.title === 'string' ? parsed.title : undefined;
        const model = typeof parsed.model === 'string' ? parsed.model : undefined;
        const createdAt = typeof parsed.createdAt === 'string'
          ? parsed.createdAt
          : typeof parsed.timestamp === 'string'
            ? parsed.timestamp
            : '';
        const updatedAt = typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : typeof parsed.timestamp === 'string'
            ? parsed.timestamp
            : createdAt;
        if (id && cwd && createdAt && updatedAt) {
          meta = {
            type: 'session',
            id,
            cwd,
            ...(title !== undefined ? { title } : {}),
            ...(model !== undefined ? { model } : {}),
            ...(typeof parsed.thinkingLevel === 'string' ? { thinkingLevel: parsed.thinkingLevel as Session['thinkingLevel'] } : {}),
            ...(typeof parsed.piSessionId === 'string' ? { piSessionId: parsed.piSessionId } : {}),
            ...(typeof parsed.piSessionFile === 'string' ? { piSessionFile: parsed.piSessionFile } : {}),
            ...(typeof parsed.status === 'string' ? { status: parsed.status as SessionStatus } : {}),
            ...(typeof parsed.statusMessage === 'string' ? { statusMessage: parsed.statusMessage } : {}),
            ...(isRecord(parsed.statusMetadata) ? { statusMetadata: parsed.statusMetadata } : {}),
            createdAt,
            updatedAt,
          };
        }
        continue;
      }

      const message = parseMessageRecord(parsed);
      if (message) {
        messages.push(message);
      }
    } catch {
      continue;
    }
  }

  if (!meta) {
    return undefined;
  }

  return {
    id: meta.id,
    cwd: meta.cwd,
    ...(meta.title !== undefined ? { title: meta.title } : {}),
    model: meta.model,
    ...(meta.thinkingLevel !== undefined ? { thinkingLevel: meta.thinkingLevel } : {}),
    ...(meta.piSessionId !== undefined ? { piSessionId: meta.piSessionId } : {}),
    ...(meta.piSessionFile !== undefined ? { piSessionFile: meta.piSessionFile } : {}),
    status: deriveStatus(messages, meta.status),
    ...(meta.statusMessage !== undefined ? { statusMessage: meta.statusMessage } : {}),
    ...(meta.statusMetadata !== undefined ? { statusMetadata: meta.statusMetadata } : {}),
    messages,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

export function writeSessionFileSync(sessionsDir: string, session: Session): string {
  // Save to CLI-style subdirectory when cwd is available
  const filePath = getSessionFilePath(sessionsDir, session.id, session.cwd, session.createdAt);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, sessionToJsonl(session), 'utf8');

  // Clean up old root-level file if we just saved to a subdirectory
  if (session.cwd) {
    const rootPath = path.join(sessionsDir, `${sanitizeSessionId(session.id)}.jsonl`);
    if (rootPath !== filePath) {
      try { fs.rmSync(rootPath, { force: true }); } catch {}
    }
  }

  return filePath;
}

export function deleteSessionFileSync(sessionsDir: string, sessionId: string): void {
  // Try root location first
  const rootPath = path.join(sessionsDir, `${sanitizeSessionId(sessionId)}.jsonl`);
  try {
    fs.rmSync(rootPath, { force: true });
  } catch {
    // ignore
  }

  // Then search all subdirectories for matching files
  try {
    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(sessionsDir, entry.name);
      try {
        const files = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile() && file.name.endsWith('.jsonl') && file.name.includes(sessionId)) {
            try { fs.rmSync(path.join(dirPath, file.name), { force: true }); } catch {}
          }
        }
      } catch {}
    }
  } catch {}
}

export function readSessionFileSync(filePath: string): Session | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return parseSessionJsonl(raw);
  } catch {
    return undefined;
  }
}

/**
 * Collect all JSONL session files from root AND subdirectories (Pi CLI style).
 */
function collectSessionFiles(baseDir: string): string[] {
  const files: string[] = [];

  function scan(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }
  }

  scan(baseDir);
  return files;
}

/**
 * Parse a file that might be in either web-app JSONL format or Pi CLI session format.
 * Returns a Session in web-app format, or undefined if unparseable.
 */
function readAnySessionFileSync(filePath: string): Session | undefined {
  const raw = readSessionFileSync(filePath);
  if (raw) return raw;

  // Try Pi CLI format
  return parsePiCliSessionJsonl(filePath);
}

/**
 * Parse a Pi CLI session file (e.g. from subdirectories) into a web-app Session.
 */
function parsePiCliSessionJsonl(filePath: string): Session | undefined {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }

  let cliSessionId = '';
  let cwd = '';
  let timestamp = '';
  let model: string | undefined;
  const messages: Message[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;

    const type = typeof parsed.type === 'string' ? parsed.type : '';

    if (type === 'session') {
      cliSessionId = typeof parsed.id === 'string' ? parsed.id : '';
      cwd = typeof parsed.cwd === 'string' ? parsed.cwd : '';
      // CLI uses "timestamp" instead of "createdAt"
      timestamp = typeof parsed.timestamp === 'string' ? parsed.timestamp : '';
      continue;
    }

    if (type === 'model_change') {
      const provider = typeof parsed.provider === 'string' ? parsed.provider : '';
      const modelId = typeof parsed.modelId === 'string' ? parsed.modelId : '';
      if (provider && modelId) {
        model = `${provider}/${modelId}`;
      }
      continue;
    }

    if (type === 'message') {
      const rawMessage = isRecord(parsed.message) ? parsed.message : {};
      const role = typeof rawMessage.role === 'string' ? rawMessage.role : '';
      const rawContent = rawMessage.content;
      const msgTimestamp = typeof rawMessage.timestamp === 'string'
        ? rawMessage.timestamp
        : typeof rawMessage.timestamp === 'number'
          ? new Date(rawMessage.timestamp).toISOString()
          : typeof parsed.timestamp === 'string'
            ? parsed.timestamp
            : timestamp;
      const msgId = typeof parsed.id === 'string' ? parsed.id : randomUUID();

      if (!role) continue;

      // Convert content array (Pi CLI format) to flat string
      let content = '';
      if (Array.isArray(rawContent)) {
        const parts: string[] = [];
        for (const block of rawContent) {
          if (isRecord(block)) {
            const blockType = typeof block.type === 'string' ? block.type : '';
            if (blockType === 'text') {
              parts.push(extractTextContent(block.text));
            } else if (blockType === 'thinking') {
              parts.push(extractTextContent(block.thinking));
            } else if (blockType === 'tool_use' || blockType === 'tool_call') {
              const toolName = typeof block.name === 'string' ? block.name : '';
              const toolInput = block.input ? JSON.stringify(block.input) : '';
              parts.push(`[Tool: ${toolName}] ${toolInput}`);
            } else if (blockType === 'tool_result') {
              parts.push(extractTextContent(block.content));
            }
          }
        }
        content = parts.join('\n');
      } else {
        content = extractTextContent(rawContent);
      }

      const webRole: Message['role'] = role === 'user' ? 'user'
        : role === 'assistant' ? 'assistant'
        : role === 'tool' ? 'tool_call'
        : role === 'tool_result' ? 'tool_result'
        : 'assistant';

      const message: Message = {
        id: msgId,
        role: webRole,
        content,
        timestamp: msgTimestamp,
      };
      messages.push(message);
    }
  }

  if (!cliSessionId || !cwd || !timestamp) return undefined;

  return {
    id: cliSessionId,
    cwd,
    model,
    status: deriveStatus(messages, undefined),
    messages,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function loadSessionsFromDirSync(sessionsDir: string): Session[] {
  const sessionFiles = collectSessionFiles(sessionsDir);

  // Parse all files, keyed by session id
  const sessionsMap = new Map<string, Session>();
  // Track which CLI session IDs are referenced by web-app files
  const referencedCliIds = new Set<string>();

  for (const fp of sessionFiles) {
    const session = readAnySessionFileSync(fp);
    if (!session) continue;

    // If this is a web-app file that references a CLI session, mark it
    if (session.piSessionId) {
      referencedCliIds.add(session.piSessionId);
    }

    // Deduplicate by id: keep the entry with the more recent createdAt
    const existing = sessionsMap.get(session.id);
    if (!existing || session.createdAt > existing.createdAt) {
      sessionsMap.set(session.id, session);
    }
  }

  // Remove CLI-only entries that have a corresponding web-app wrapper file.
  // The web-app file (with richer metadata) is kept; the CLI-only file's
  // messages will be merged at runtime by mergeSessionFromPiSnapshot.
  for (const cliId of referencedCliIds) {
    if (cliId === '') continue;
    // Only remove if BOTH a CLI entry AND a web entry exist
    // (the web entry won't have the CLI session id as its own id)
    const hasWebEntry = [...sessionsMap.values()].some(
      (s) => s.piSessionId === cliId
    );
    if (hasWebEntry && sessionsMap.has(cliId)) {
      sessionsMap.delete(cliId);
    }
  }

  return Array.from(sessionsMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeSessionFile(sessionsDir: string, session: Session): Promise<string> {
  return writeSessionFileSync(sessionsDir, session);
}

export async function deleteSessionFile(sessionsDir: string, sessionId: string): Promise<void> {
  deleteSessionFileSync(sessionsDir, sessionId);
}

export async function readSessionFile(filePath: string): Promise<Session | undefined> {
  return readSessionFileSync(filePath);
}

export async function loadSessionsFromDir(sessionsDir: string): Promise<Session[]> {
  try {
    return loadSessionsFromDirSync(sessionsDir);
  } catch {
    return [];
  }
}
