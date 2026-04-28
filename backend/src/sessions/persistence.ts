import fs from 'node:fs';
import path from 'node:path';
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
}

type SessionRecord = SessionMetaRecord | MessageRecord;

export interface SessionFileSnapshot {
  session: Session;
  filePath: string;
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
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

  if (messageId !== undefined) record.messageId = messageId;
  if (toolName !== undefined) record.toolName = toolName;
  if (toolCallId !== undefined) record.toolCallId = toolCallId;
  if (success !== undefined) record.success = success;
  if (stopReason !== undefined) record.stopReason = stopReason;
  if (errorMessage !== undefined) record.errorMessage = errorMessage;
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

export function getSessionFilePath(sessionsDir: string, sessionId: string): string {
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
    messages,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

export function writeSessionFileSync(sessionsDir: string, session: Session): string {
  fs.mkdirSync(sessionsDir, { recursive: true });
  const filePath = getSessionFilePath(sessionsDir, session.id);
  fs.writeFileSync(filePath, sessionToJsonl(session), 'utf8');
  return filePath;
}

export function deleteSessionFileSync(sessionsDir: string, sessionId: string): void {
  const filePath = getSessionFilePath(sessionsDir, sessionId);
  fs.rmSync(filePath, { force: true });
}

export function readSessionFileSync(filePath: string): Session | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return parseSessionJsonl(raw);
  } catch {
    return undefined;
  }
}

export function loadSessionsFromDirSync(sessionsDir: string): Session[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions: Session[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
      continue;
    }

    const session = readSessionFileSync(path.join(sessionsDir, entry.name));
    if (session) {
      sessions.push(session);
    }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
