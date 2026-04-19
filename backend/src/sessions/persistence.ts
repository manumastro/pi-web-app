import fs from 'node:fs';
import path from 'node:path';
import type { Session, Message, SessionStatus } from './store.js';

interface SessionMetaRecord {
  type: 'session';
  id: string;
  cwd: string;
  model: string | undefined;
  status: SessionStatus;
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
}

type SessionRecord = SessionMetaRecord | MessageRecord;

export interface SessionFileSnapshot {
  session: Session;
  filePath: string;
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
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
      model: session.model,
      status: session.status,
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
      const parsed = JSON.parse(trimmed) as Partial<SessionRecord>;
      if (parsed.type === 'session') {
        meta = parsed as SessionMetaRecord;
      } else if (parsed.type === 'message') {
        const message = parsed as MessageRecord;
        if (message.id && message.role && message.content && message.timestamp) {
          const record: Message = {
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
          };
          if (message.messageId !== undefined) record.messageId = message.messageId;
          if (message.toolName !== undefined) record.toolName = message.toolName;
          if (message.toolCallId !== undefined) record.toolCallId = message.toolCallId;
          if (message.success !== undefined) record.success = message.success;
          messages.push(record);
        }
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
    model: meta.model,
    status: meta.status,
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
