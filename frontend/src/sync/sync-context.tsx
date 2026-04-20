import React, { useCallback } from 'react';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { ChildStoreManager } from './child-store';
import { getSessionStatusType } from './sessionActivity';
import type { SessionActivityResult } from './sessionActivity';
import { setSyncRefs } from './sync-refs';
import type { SyncDirectoryState } from './types';

const syncSystem = {
  childStores: new ChildStoreManager(),
  directory: '',
};

const EMPTY_SUBSCRIBE = () => () => {};
const EMPTY_SESSION_LIST: SyncDirectoryState['session'] = [];
const EMPTY_MESSAGE_LIST: never[] = [];
const EMPTY_DIRECTORY_STATE: SyncDirectoryState = {
  status: 'loading',
  session: [],
  session_status: {},
  message: {},
  session_diff: {},
  todo: {},
  permission: {},
  question: {},
  mcp: {},
  lsp: [],
  vcs: undefined,
  limit: 5,
};

export function setSyncDirectory(directory: string): void {
  syncSystem.directory = directory;
  setSyncRefs(syncSystem.childStores, directory);
}

setSyncRefs(syncSystem.childStores, syncSystem.directory);

export function getSyncSystem() {
  return syncSystem;
}

export function useSyncSystem() {
  return syncSystem;
}

export function useChildStoreManager() {
  return syncSystem.childStores;
}

export function useSyncDirectory() {
  return syncSystem.directory;
}

export function useDirectoryStore(directory?: string) {
  const dir = directory ?? syncSystem.directory;
  if (!dir) {
    return React.useSyncExternalStore(EMPTY_SUBSCRIBE, () => EMPTY_DIRECTORY_STATE, () => EMPTY_DIRECTORY_STATE);
  }
  const store = syncSystem.childStores.ensureChild(dir, { bootstrap: false });
  return React.useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useSessionStatus(sessionID: string, directory?: string) {
  const store = useDirectoryStore(directory);
  return store.session_status[sessionID];
}

export function useSessionMessages(sessionID: string, directory?: string) {
  const store = useDirectoryStore(directory);
  return store.message[sessionID] ?? EMPTY_MESSAGE_LIST;
}

export function useSessionPermissions(): unknown[] {
  return EMPTY_MESSAGE_LIST;
}

export function useSessionQuestions(): unknown[] {
  return EMPTY_MESSAGE_LIST;
}

export function useSessions(directory?: string) {
  return useDirectoryStore(directory).session;
}

const getSidebarSessionSignature = (session: SyncDirectoryState['session'][number], stableUpdatedAt: number): string => {
  const status = getSessionStatusType(session.status);
  return [
    session.id,
    session.title ?? '',
    session.createdAt,
    session.updatedAt,
    session.cwd,
    status ?? '',
    stableUpdatedAt,
  ].join('|');
};

export function useSidebarSessions(directory?: string) {
  const dir = directory ?? syncSystem.directory;
  if (!dir) {
    return React.useSyncExternalStore(EMPTY_SUBSCRIBE, () => EMPTY_SESSION_LIST, () => EMPTY_SESSION_LIST);
  }
  const storeApi = syncSystem.childStores.ensureChild(dir, { bootstrap: false });
  const cacheRef = React.useRef<{
    source: SyncDirectoryState['session'];
    streamingSignature: string;
    array: SyncDirectoryState['session'];
    signatures: Map<string, string>;
    sessionsById: Map<string, SyncDirectoryState['session'][number]>;
    stableUpdatedAtById: Map<string, number>;
    streamingById: Map<string, boolean>;
  } | null>(null);

  const getSnapshot = React.useCallback(() => {
    const state = storeApi.getState();
    const source = state.session;
    const cached = cacheRef.current;
    const streamingSignature = source
      .map((session) => {
        const statusType = state.session_status?.[session.id]?.type;
        const isStreaming = statusType === 'busy' || statusType === 'retry';
        return `${session.id}:${isStreaming ? 1 : 0}`;
      })
      .join('|');

    if (cached && cached.source === source && cached.streamingSignature === streamingSignature) {
      return cached.array;
    }

    const signatures = new Map<string, string>();
    const sessionsById = new Map<string, SyncDirectoryState['session'][number]>();
    const stableUpdatedAtById = new Map<string, number>();
    const streamingById = new Map<string, boolean>();
    let changed = !cached || cached.array.length !== source.length;

    const array = source.map((session) => {
      const rawUpdatedAt = Number(session.updatedAt ? new Date(session.updatedAt).getTime() : 0);
      const statusType = state.session_status?.[session.id]?.type;
      const isStreaming = statusType === 'busy' || statusType === 'retry';
      const cachedUpdatedAt = cached?.stableUpdatedAtById.get(session.id) ?? rawUpdatedAt;
      const wasStreaming = cached?.streamingById.get(session.id) ?? false;
      const stableUpdatedAt = isStreaming
        ? (wasStreaming ? cachedUpdatedAt : Math.max(rawUpdatedAt, cachedUpdatedAt, Date.now()))
        : cachedUpdatedAt;
      const signature = getSidebarSessionSignature(session, stableUpdatedAt);
      signatures.set(session.id, signature);
      stableUpdatedAtById.set(session.id, stableUpdatedAt);
      streamingById.set(session.id, isStreaming);

      const cachedSession = cached?.sessionsById.get(session.id);
      if (cachedSession && cached?.signatures.get(session.id) === signature) {
        sessionsById.set(session.id, cachedSession);
        return cachedSession;
      }

      changed = true;
      const nextSession = stableUpdatedAt === rawUpdatedAt
        ? session
        : { ...session, updatedAt: new Date(stableUpdatedAt).toISOString() };
      sessionsById.set(session.id, nextSession);
      return nextSession;
    });

    if (!changed && cached) {
      cacheRef.current = {
        source,
        streamingSignature,
        array: cached.array,
        signatures,
        sessionsById: cached.sessionsById,
        stableUpdatedAtById,
        streamingById,
      };
      return cached.array;
    }

    cacheRef.current = { source, streamingSignature, array, signatures, sessionsById, stableUpdatedAtById, streamingById };
    return array;
  }, [storeApi]);

  return React.useSyncExternalStore(storeApi.subscribe, getSnapshot, getSnapshot);
}

export function useSession(sessionID?: string | null, directory?: string) {
  const dir = directory ?? syncSystem.directory;
  const getSnapshot = useCallback(() => {
    if (!dir || !sessionID) {
      return undefined;
    }
    const store = syncSystem.childStores.getChild(dir);
    if (!store) {
      return undefined;
    }
    return store.getState().session.find((session) => session.id === sessionID);
  }, [dir, sessionID]);

  const subscribe = useCallback((notify: () => void) => {
    if (!dir) {
      return () => {};
    }
    const store = syncSystem.childStores.ensureChild(dir, { bootstrap: false });
    return store.subscribe(notify);
  }, [dir]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useSessionDirectory(sessionID?: string | null, directory?: string): string | undefined {
  const session = useSession(sessionID, directory);
  return session?.cwd;
}

export function useSessionActivity(sessionId: string | null | undefined, directory?: string): SessionActivityResult {
  const sessionStatus = useSessionStatus(sessionId ?? '', directory);
  const statusType = getSessionStatusType(sessionStatus);
  const phase = statusType === 'retry' ? 'retry' : statusType && statusType !== 'idle' ? 'busy' : 'idle';
  if (!sessionId || phase === 'idle') {
    return {
      phase: 'idle',
      isWorking: false,
      isBusy: false,
      isCooldown: false,
    };
  }

  return {
    phase,
    isWorking: true,
    isBusy: true,
    isCooldown: false,
  };
}

export function useCurrentSessionActivity(): SessionActivityResult {
  const currentSession = useSessionUiStore((state) => state.currentSession);
  return useSessionActivity(currentSession?.id, currentSession?.cwd);
}
