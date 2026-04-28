import type { Session, SessionStore } from './store.js';
import { createSessionStore } from './store.js';
import { deleteSessionFileSync, writeSessionFileSync, loadSessionsFromDirSync, readSessionFileSync } from './persistence.js';

export interface PersistentSessionStore extends SessionStore {
  hydrateSync: () => void;
}

export function createPersistentSessionStore(sessionsDir: string): PersistentSessionStore {
  const baseStore = createSessionStore();

  function persist(session: Session | undefined): void {
    if (!session) {
      return;
    }
    writeSessionFileSync(sessionsDir, session);
  }

  function mergeSessionFromPiSnapshot(session: Session | undefined): Session | undefined {
    if (!session?.piSessionFile) {
      return session;
    }

    const snapshot = readSessionFileSync(session.piSessionFile);
    if (!snapshot) {
      return session;
    }

    return {
      ...session,
      status: snapshot.status,
      messages: snapshot.messages,
      ...(snapshot.model !== undefined ? { model: snapshot.model } : {}),
      ...(snapshot.thinkingLevel !== undefined ? { thinkingLevel: snapshot.thinkingLevel } : {}),
      ...(snapshot.piSessionId !== undefined ? { piSessionId: snapshot.piSessionId } : {}),
      ...(snapshot.piSessionFile !== undefined ? { piSessionFile: snapshot.piSessionFile } : {}),
      ...(!session.title && snapshot.title ? { title: snapshot.title } : {}),
    };
  }

  return {
    ...baseStore,
    hydrateSync(): void {
      const sessions = loadSessionsFromDirSync(sessionsDir);
      baseStore.seedSessions(sessions.map((session) => mergeSessionFromPiSnapshot(session) ?? session));
    },
    getSession(id: string): Session | undefined {
      const existing = baseStore.getSession(id);
      const merged = mergeSessionFromPiSnapshot(existing);
      if (!merged) return existing;
      if (existing && existing !== merged) {
        return baseStore.updateSession(id, merged) ?? merged;
      }
      return merged;
    },
    listSessions(cwd?: string): Session[] {
      return baseStore.listSessions(cwd).map((session) => {
        const merged = mergeSessionFromPiSnapshot(session);
        if (!merged) return session;
        return baseStore.updateSession(session.id, merged) ?? merged;
      });
    },
    createSession(cwd: string, model?: string, id?: string): Session {
      const session = baseStore.createSession(cwd, model, id);
      persist(session);
      return session;
    },
    updateSession(id: string, updates: Partial<Session>): Session | undefined {
      const session = baseStore.updateSession(id, updates);
      persist(session);
      return session;
    },
    addMessage(sessionId: string, message: Parameters<SessionStore['addMessage']>[1]): Session | undefined {
      const session = baseStore.addMessage(sessionId, message);
      persist(session);
      return session;
    },
    deleteSession(id: string): boolean {
      const deleted = baseStore.deleteSession(id);
      if (deleted) {
        deleteSessionFileSync(sessionsDir, id);
      }
      return deleted;
    },
    clearAll(): void {
      baseStore.clearAll();
    },
  };
}
