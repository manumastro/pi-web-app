import { create } from 'zustand';
import type { SessionInfo } from '@/types';

interface SessionState {
  sessions: SessionInfo[];
  sessionStatuses: Record<string, SessionInfo['status']>;
  sortedSessions: SessionInfo[];
  setSessions: (sessions: SessionInfo[]) => void;
  addSession: (session: SessionInfo) => void;
  updateSession: (id: string, updates: Partial<SessionInfo>) => void;
  deleteSession: (id: string) => void;
}

function sortSessions(sessions: SessionInfo[]): SessionInfo[] {
  return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  sessionStatuses: {},
  sortedSessions: [],

  setSessions: (sessions) => {
    const sorted = sortSessions(sessions);
    set({
      sessions: sorted,
      sessionStatuses: Object.fromEntries(sorted.map((session) => [session.id, session.status])),
      sortedSessions: sorted,
    });
  },

  addSession: (session) => {
    const state = get();
    const sessions = sortSessions([...state.sessions, session]);
    set({
      sessions,
      sessionStatuses: { ...state.sessionStatuses, [session.id]: session.status },
      sortedSessions: sessions,
    });
  },

  updateSession: (id, updates) => {
    const state = get();
    const sessions = state.sessions.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry));
    const sorted = sortSessions(sessions);
    const sessionStatuses = updates.status !== undefined
      ? { ...state.sessionStatuses, [id]: updates.status }
      : state.sessionStatuses;

    set({
      sessions: sorted,
      sessionStatuses,
      sortedSessions: sorted,
    });
  },

  deleteSession: (id) => {
    const state = get();
    const sessions = state.sessions.filter((entry) => entry.id !== id);
    const sorted = sortSessions(sessions);
    const { [id]: _removed, ...sessionStatuses } = state.sessionStatuses;

    set({
      sessions: sorted,
      sessionStatuses,
      sortedSessions: sorted,
    });
  },
}));
