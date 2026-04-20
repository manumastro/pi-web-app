/**
 * In-memory session store
 * Manages sessions with their messages and state
 */

import { randomUUID } from 'crypto';

export type SessionStatus =
  | 'idle'
  | 'busy'
  | 'retry'
  | 'error'
  | 'prompting'
  | 'answering'
  | 'waiting_question'
  | 'waiting_permission'
  | 'paused'
  | 'done';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result';
  content: string;
  timestamp: string;
  messageId?: string;
  toolName?: string;
  toolCallId?: string;
  success?: boolean;
}

export interface Session {
  id: string;
  cwd: string;
  title?: string;
  model: string | undefined;
  status: SessionStatus;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionStore {
  createSession: (cwd: string, model?: string, id?: string) => Session;
  getSession: (id: string) => Session | undefined;
  listSessions: (cwd?: string) => Session[];
  updateSession: (id: string, updates: Partial<Session>) => Session | undefined;
  deleteSession: (id: string) => boolean;
  addMessage: (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => Session | undefined;
  seedSessions: (sessions: Session[]) => void;
  clearAll: () => void;
}

export function normalizeSessionStatus(status: SessionStatus): SessionStatus {
  switch (status) {
    case 'idle':
    case 'busy':
    case 'retry':
    case 'error':
      return status;
    case 'done':
    case 'paused':
      return 'idle';
    case 'prompting':
    case 'answering':
    case 'waiting_question':
    case 'waiting_permission':
      return 'busy';
    default:
      return 'busy';
  }
}

function createMessage(partial: Omit<Message, 'id' | 'timestamp'>): Message {
  return {
    ...partial,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
}

function createSessionObject(
  id: string,
  cwd: string,
  model?: string,
  title?: string,
): Session {
  const now = new Date().toISOString();
  return {
    id,
    cwd,
    ...(title !== undefined ? { title } : {}),
    model,
    status: 'idle',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Factory function to create a new session store
 */
export function createSessionStore(): SessionStore {
  const sessions = new Map<string, Session>();

  return {
    createSession(cwd: string, model?: string, id?: string): Session {
      const sessionId = id ?? randomUUID();
      const session = createSessionObject(sessionId, cwd, model);
      sessions.set(sessionId, session);
      return session;
    },

    getSession(id: string): Session | undefined {
      return sessions.get(id);
    },

    listSessions(cwd?: string): Session[] {
      const allSessions = Array.from(sessions.values());
      if (cwd === undefined) {
        return allSessions;
      }
      return allSessions.filter((s) => s.cwd === cwd);
    },

    updateSession(id: string, updates: Partial<Session>): Session | undefined {
      const session = sessions.get(id);
      if (!session) {
        return undefined;
      }

      const updated: Session = {
        ...session,
        ...updates,
        ...(updates.status !== undefined ? { status: normalizeSessionStatus(updates.status) } : {}),
        id: session.id, // Prevent ID mutation
        updatedAt: new Date().toISOString(),
      };

      sessions.set(id, updated);
      return updated;
    },

    deleteSession(id: string): boolean {
      return sessions.delete(id);
    },

    addMessage(
      sessionId: string,
      message: Omit<Message, 'id' | 'timestamp'>,
    ): Session | undefined {
      const session = sessions.get(sessionId);
      if (!session) {
        return undefined;
      }

      const newMessage = createMessage(message);
      const updated: Session = {
        ...session,
        messages: [...session.messages, newMessage],
        updatedAt: new Date().toISOString(),
      };

      sessions.set(sessionId, updated);
      return updated;
    },

    seedSessions(items: Session[]): void {
      sessions.clear();
      for (const session of items) {
        sessions.set(session.id, {
          ...session,
          status: normalizeSessionStatus(session.status),
        });
      }
    },

    clearAll(): void {
      sessions.clear();
    },
  };
}
