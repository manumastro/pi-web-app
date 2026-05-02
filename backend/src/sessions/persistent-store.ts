import fs from 'node:fs';
import type { Session, SessionStore } from './store.js';
import { createSessionStore } from './store.js';
import { deleteSessionFileSync, writeSessionFileSync, loadSessionsFromDirSync, readSessionFileSync } from './persistence.js';

export interface PersistentSessionStore extends SessionStore {
  hydrateSync: () => void;
}

type SnapshotCacheEntry = {
  mtimeMs: number;
  size: number;
  session: Session | undefined;
};

export function createPersistentSessionStore(sessionsDir: string): PersistentSessionStore {
  const baseStore = createSessionStore();
  const snapshotCache = new Map<string, SnapshotCacheEntry>();

  function persist(session: Session | undefined): void {
    if (!session) {
      return;
    }
    writeSessionFileSync(sessionsDir, session);
  }

  function readCachedPiSnapshot(filePath: string): Session | undefined {
    try {
      const stat = fs.statSync(filePath);
      const cached = snapshotCache.get(filePath);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.session;
      }

      const snapshot = readSessionFileSync(filePath);
      snapshotCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, session: snapshot });
      return snapshot;
    } catch {
      snapshotCache.delete(filePath);
      return undefined;
    }
  }

  function mergeSessionFromPiSnapshot(session: Session | undefined): Session | undefined {
    if (!session?.piSessionFile) {
      return session;
    }

    const snapshot = readCachedPiSnapshot(session.piSessionFile);
    if (!snapshot) {
      return session;
    }

    return {
      ...session,
      status: snapshot.status,
      // Keep local store messages when present: they preserve frontend-facing
      // message IDs used by optimistic reconciliation.
      messages: session.messages.length > 0 ? session.messages : snapshot.messages,
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
      return mergeSessionFromPiSnapshot(existing) ?? existing;
    },
    listSessions(cwd?: string): Session[] {
      return baseStore.listSessions(cwd);
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
