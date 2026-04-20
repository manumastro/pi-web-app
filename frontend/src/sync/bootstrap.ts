import type { SessionInfo } from '@/types';
import { messagesToConversation, rehydrateConversationForSession } from '@/chatState';
import { getSessionStatusType, isRunningSessionStatus } from './sessionActivity';
import { getSyncChildStores } from './sync-refs';
import type { SyncDirectoryState, SyncSessionStatus } from './types';

export interface SessionBootstrapDeps {
  updateSession: (id: string, session: SessionInfo) => void;
  setConversation: (value: ReturnType<typeof messagesToConversation>) => void;
  setSelectedSessionId: (id: string) => void;
  setSelectedDirectory: (cwd: string) => void;
  setStreaming: (state: 'idle' | 'streaming' | 'connecting' | 'error') => void;
  setStatusMessage: (message: string) => void;
}

function toSyncStatus(status?: string | null): SyncSessionStatus {
  return {
    type: status ?? 'idle',
    timestamp: Date.now(),
  };
}

export function buildDirectoryState(sessions: SessionInfo[]): SyncDirectoryState {
  const session_status: Record<string, SyncSessionStatus> = {};
  const message: SyncDirectoryState['message'] = {};

  for (const session of sessions) {
    session_status[session.id] = toSyncStatus(session.status);
    message[session.id] = session.messages;
  }

  return {
    status: 'complete',
    session: [...sessions],
    session_status,
    message,
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
    mcp: {},
    lsp: [],
    vcs: undefined,
    limit: 5,
  };
}

export function hydrateDirectorySnapshot(directory: string, sessions: SessionInfo[]): void {
  const childStores = getSyncChildStores();
  childStores.replace(directory, buildDirectoryState(sessions));
}

export function hydrateSessionDirectories(sessions: SessionInfo[]): void {
  const grouped = new Map<string, SessionInfo[]>();
  for (const session of sessions) {
    const list = grouped.get(session.cwd) ?? [];
    list.push(session);
    grouped.set(session.cwd, list);
  }

  for (const [directory, items] of grouped.entries()) {
    hydrateDirectorySnapshot(directory, items);
  }
}

export function reconcileSessionDirectories(sessions: SessionInfo[]): void {
  const childStores = getSyncChildStores();
  const nextDirectories = new Set<string>();
  for (const session of sessions) {
    nextDirectories.add(session.cwd);
  }

  for (const directory of [...childStores.children.keys()]) {
    if (!nextDirectories.has(directory)) {
      childStores.disposeDirectory(directory);
    }
  }

  hydrateSessionDirectories(sessions);
}

export function upsertDirectorySession(session: SessionInfo): void {
  const childStores = getSyncChildStores();
  const existing = childStores.getState(session.cwd);
  if (!existing) {
    hydrateDirectorySnapshot(session.cwd, [session]);
    return;
  }

  const nextSessions = existing.session.some((entry) => entry.id === session.id)
    ? existing.session.map((entry) => (entry.id === session.id ? session : entry))
    : [...existing.session, session];

  childStores.replace(session.cwd, buildDirectoryState(nextSessions));
}

export function hydrateSelectedSessionSnapshot(
  session: SessionInfo,
  deps: Pick<SessionBootstrapDeps, 'updateSession' | 'setConversation' | 'setSelectedSessionId' | 'setSelectedDirectory' | 'setStreaming' | 'setStatusMessage'>,
): void {
  deps.updateSession(session.id, session);
  deps.setConversation(rehydrateConversationForSession(session.messages, getSessionStatusType(session.status)));
  deps.setSelectedSessionId(session.id);
  deps.setSelectedDirectory(session.cwd);
  deps.setStreaming(isRunningSessionStatus(session.status) ? 'streaming' : 'idle');
  deps.setStatusMessage(isRunningSessionStatus(session.status) ? 'Working' : 'Connected');
}

export function normalizeSelectedSessionConversation(session: SessionInfo) {
  return rehydrateConversationForSession(session.messages, getSessionStatusType(session.status));
}
