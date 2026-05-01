import type { SessionInfo } from '@/types';
import { messagesToConversation, rehydrateConversationForSession } from '@/sync/conversation';
import { hydrateStreamingSession } from './streaming';
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

function toSyncStatus(session: SessionInfo, previous?: SyncSessionStatus): SyncSessionStatus {
  return {
    type: session.status ?? previous?.type ?? 'idle',
    timestamp: Date.now(),
    ...(session.statusMessage !== undefined
      ? { message: session.statusMessage }
      : (previous?.message ? { message: previous.message } : {})),
    ...(previous?.needsAttention !== undefined ? { needsAttention: previous.needsAttention } : {}),
    ...(session.statusMetadata !== undefined
      ? { metadata: session.statusMetadata }
      : (previous?.metadata ? { metadata: previous.metadata } : {})),
  };
}

export function buildDirectoryState(
  sessions: SessionInfo[],
  previousStatusMap?: Record<string, SyncSessionStatus>,
): SyncDirectoryState {
  const session_status: Record<string, SyncSessionStatus> = {};
  const message: SyncDirectoryState['message'] = {};

  for (const session of sessions) {
    const previous = previousStatusMap?.[session.id];
    session_status[session.id] = toSyncStatus(session, previous);
    message[session.id] = session.messages ?? [];
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
  const previous = childStores.getState(directory);
  childStores.replace(directory, buildDirectoryState(sessions, previous?.session_status));
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

  childStores.replace(session.cwd, buildDirectoryState(nextSessions, existing.session_status));
}

export function hydrateSelectedSessionSnapshot(
  session: SessionInfo,
  deps: Pick<SessionBootstrapDeps, 'updateSession' | 'setConversation' | 'setSelectedSessionId' | 'setSelectedDirectory' | 'setStreaming' | 'setStatusMessage'>,
): void {
  deps.updateSession(session.id, { ...session, messages: session.messages ?? [] });
  const conversation = rehydrateConversationForSession(session.messages ?? [], getSessionStatusType(session.status));
  deps.setConversation(conversation);
  hydrateStreamingSession(session.id, conversation, getSessionStatusType(session.status));
  deps.setSelectedSessionId(session.id);
  deps.setSelectedDirectory(session.cwd);
  deps.setStreaming(isRunningSessionStatus(session.status) ? 'streaming' : 'idle');
  deps.setStatusMessage(isRunningSessionStatus(session.status) ? 'Working' : 'Connected');
}

export function normalizeSelectedSessionConversation(session: SessionInfo) {
  return rehydrateConversationForSession(session.messages ?? [], getSessionStatusType(session.status));
}
