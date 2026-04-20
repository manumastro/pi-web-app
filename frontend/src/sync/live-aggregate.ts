import type { SyncSessionStatus } from './types';
import { getSyncChildStores } from './sync-refs';
import type { SessionInfo } from '@/types';

const getSessionUpdatedAt = (session: SessionInfo): number => {
  const updatedAt = Date.parse(session.updatedAt);
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }
  const createdAt = Date.parse(session.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
};

const getStatusPriority = (status: SyncSessionStatus | undefined): number => {
  switch (status?.type) {
    case 'retry':
      return 4;
    case 'busy':
      return 3;
    case 'idle':
      return 1;
    default:
      return 0;
  }
};

type StatusCandidate = {
  status: SyncSessionStatus;
  sessionUpdatedAt: number;
};

const shouldReplaceStatusCandidate = (current: StatusCandidate | undefined, next: StatusCandidate): boolean => {
  if (!current) {
    return true;
  }

  if (next.sessionUpdatedAt !== current.sessionUpdatedAt) {
    return next.sessionUpdatedAt > current.sessionUpdatedAt;
  }

  return getStatusPriority(next.status) >= getStatusPriority(current.status);
};

export function aggregateLiveSessions(states: Iterable<{ session: SessionInfo[] }>): SessionInfo[] {
  const sessionsById = new Map<string, SessionInfo>();

  for (const state of states) {
    for (const session of state.session) {
      if (!session?.id) {
        continue;
      }
      const current = sessionsById.get(session.id);
      if (!current || getSessionUpdatedAt(session) >= getSessionUpdatedAt(current)) {
        sessionsById.set(session.id, session);
      }
    }
  }

  return Array.from(sessionsById.values()).sort((left, right) => getSessionUpdatedAt(right) - getSessionUpdatedAt(left));
}

export function aggregateLiveSessionStatuses(states: Iterable<{ session: SessionInfo[]; session_status: Record<string, SyncSessionStatus> }>): Record<string, SyncSessionStatus> {
  const candidates = new Map<string, StatusCandidate>();

  for (const state of states) {
    for (const sessionId of Object.keys(state.session_status ?? {})) {
      const status = state.session_status[sessionId];
      if (!status) {
        continue;
      }

      const session = state.session.find((candidate) => candidate.id === sessionId);
      const next: StatusCandidate = {
        status,
        sessionUpdatedAt: session ? getSessionUpdatedAt(session) : -1,
      };

      const current = candidates.get(sessionId);
      if (shouldReplaceStatusCandidate(current, next)) {
        candidates.set(sessionId, next);
      }
    }
  }

  const statuses: Record<string, SyncSessionStatus> = {};
  for (const [sessionId, candidate] of candidates) {
    statuses[sessionId] = candidate.status;
  }

  return statuses;
}

export function findLiveSession(sessionID?: string | null): SessionInfo | undefined {
  if (!sessionID) {
    return undefined;
  }

  let match: SessionInfo | undefined;
  for (const store of getSyncChildStores().children.values()) {
    const session = store.getState().session.find((candidate) => candidate.id === sessionID);
    if (!session) {
      continue;
    }
    if (!match || getSessionUpdatedAt(session) >= getSessionUpdatedAt(match)) {
      match = session;
    }
  }

  return match;
}

export function findLiveSessionStatus(sessionID?: string | null): SyncSessionStatus | undefined {
  if (!sessionID) {
    return undefined;
  }

  let match: StatusCandidate | undefined;
  for (const store of getSyncChildStores().children.values()) {
    const state = store.getState();
    const status = state.session_status[sessionID];
    if (!status) {
      continue;
    }
    const session = state.session.find((candidate) => candidate.id === sessionID);
    const next: StatusCandidate = {
      status,
      sessionUpdatedAt: session ? getSessionUpdatedAt(session) : -1,
    };
    if (shouldReplaceStatusCandidate(match, next)) {
      match = next;
    }
  }

  return match?.status;
}
