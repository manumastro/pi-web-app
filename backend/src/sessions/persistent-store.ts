import type { Session, SessionStore } from './store.js';
import { createSessionStore } from './store.js';
import { deleteSessionFileSync, writeSessionFileSync, loadSessionsFromDirSync } from './persistence.js';

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

  return {
    ...baseStore,
    hydrateSync(): void {
      const sessions = loadSessionsFromDirSync(sessionsDir);
      baseStore.seedSessions(sessions);
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
