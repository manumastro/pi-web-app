/**
 * In-memory session store
 * Manages sessions with their messages and state
 */

import { randomUUID } from 'crypto';

export type SessionStatus =
  | 'idle'
  | 'prompting'
  | 'steering'
  | 'answering'
  | 'waiting_question'
  | 'waiting_permission'
  | 'paused'
  | 'error'
  | 'done';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  cwd: string;
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
  clearAll: () => void;
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
): Session {
  const now = new Date().toISOString();
  return {
    id,
    cwd,
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

    clearAll(): void {
      sessions.clear();
    },
  };
}
