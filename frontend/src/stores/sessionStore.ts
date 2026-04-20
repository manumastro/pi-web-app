import { create } from 'zustand';
import type { SessionInfo, DirectoryInfo } from '@/types';

interface SessionState {
  // Session state
  sessions: SessionInfo[];
  sessionStatuses: Record<string, SessionInfo['status']>;
  selectedDirectory: string;
  selectedSessionId: string;
  
  // Derived
  sortedSessions: SessionInfo[];
  projectDirectories: DirectoryInfo[];
  currentSession: SessionInfo | undefined;
  visibleSessions: SessionInfo[];
  
  // Actions
  setSessions: (sessions: SessionInfo[]) => void;
  addSession: (session: SessionInfo) => void;
  updateSession: (id: string, updates: Partial<SessionInfo>) => void;
  deleteSession: (id: string) => void;
  setSelectedDirectory: (cwd: string) => void;
  setSelectedSessionId: (id: string) => void;
}

function formatDirectoryLabel(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  return parts.at(-1) ?? (cwd === '/' ? 'root' : cwd);
}

function summarizeDirectories(sessions: SessionInfo[]): DirectoryInfo[] {
  const grouped = new Map<string, DirectoryInfo>();
  for (const session of sessions) {
    const current = grouped.get(session.cwd);
    if (current) {
      current.sessionCount += 1;
      if (session.updatedAt > current.updatedAt) {
        current.updatedAt = session.updatedAt;
      }
      continue;
    }
    grouped.set(session.cwd, {
      cwd: session.cwd,
      label: formatDirectoryLabel(session.cwd),
      sessionCount: 1,
      updatedAt: session.updatedAt,
    });
  }
  return Array.from(grouped.values()).sort((l, r) => r.updatedAt.localeCompare(l.updatedAt));
}

function pickInitialSelection(
  sessions: SessionInfo[],
  queryCwd: string,
  querySessionId: string,
): { cwd: string; sessionId: string } {
  if (querySessionId) {
    const found = sessions.find((s) => s.id === querySessionId);
    if (found) return { cwd: found.cwd, sessionId: found.id };
  }
  const directories = summarizeDirectories(sessions);
  if (queryCwd) {
    const found = directories.find((d) => d.cwd === queryCwd);
    if (found) {
      const first = sessions.find((s) => s.cwd === found.cwd);
      return { cwd: found.cwd, sessionId: first?.id ?? '' };
    }
  }
  if (directories[0]) {
    const first = sessions.find((s) => s.cwd === directories[0]!.cwd);
    return { cwd: directories[0]!.cwd, sessionId: first?.id ?? '' };
  }
  return { cwd: queryCwd || '/', sessionId: '' };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial state
  sessions: [],
  sessionStatuses: {},
  selectedDirectory: '/',
  selectedSessionId: '',
  sortedSessions: [],
  projectDirectories: [],
  currentSession: undefined,
  visibleSessions: [],
  
  // Actions
  setSessions: (sessions) => {
    const sorted = [...sessions].sort((l, r) => r.updatedAt.localeCompare(l.updatedAt));
    const directories = summarizeDirectories(sorted);
    const state = get();
    const { cwd, sessionId } = pickInitialSelection(
      sorted,
      state.selectedDirectory,
      state.selectedSessionId,
    );
    const visible = sorted.filter((s) => s.cwd === cwd);
    const statuses = Object.fromEntries(sorted.map((session) => [session.id, session.status]));
    
    set({
      sessions: sorted,
      sessionStatuses: statuses,
      sortedSessions: sorted,
      projectDirectories: directories,
      selectedDirectory: cwd,
      selectedSessionId: sessionId,
      currentSession: sorted.find((s) => s.id === sessionId),
      visibleSessions: visible,
    });
  },
  
  addSession: (session) => {
    const state = get();
    const newSessions = [...state.sessions, session].sort(
      (l, r) => r.updatedAt.localeCompare(l.updatedAt)
    );
    const directories = summarizeDirectories(newSessions);
    set({
      sessions: newSessions,
      sessionStatuses: { ...state.sessionStatuses, [session.id]: session.status },
      sortedSessions: newSessions,
      projectDirectories: directories,
    });
  },
  
  updateSession: (id, updates) => {
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      );
      const sorted = [...sessions].sort((l, r) => r.updatedAt.localeCompare(l.updatedAt));
      const directories = summarizeDirectories(sorted);
      const currentSession = sessions.find((s) => s.id === id);
      const visible = sorted.filter((s) => s.cwd === state.selectedDirectory);
      const sessionStatuses = updates.status !== undefined
        ? { ...state.sessionStatuses, [id]: updates.status }
        : state.sessionStatuses;
      
      return {
        sessions,
        sessionStatuses,
        sortedSessions: sorted,
        projectDirectories: directories,
        currentSession: currentSession ? { ...currentSession, ...updates } : state.currentSession,
        visibleSessions: visible,
      };
    });
  },
  
  deleteSession: (id) => {
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      const sorted = [...sessions].sort((l, r) => r.updatedAt.localeCompare(l.updatedAt));
      const directories = summarizeDirectories(sorted);
      const { [id]: _removed, ...sessionStatuses } = state.sessionStatuses;
      
      // If deleted session was selected, clear selection
      let { selectedSessionId, selectedDirectory } = state;
      let currentSession = state.currentSession;
      
      if (state.selectedSessionId === id) {
        const firstInDir = sorted.find((s) => s.cwd === selectedDirectory);
        selectedSessionId = firstInDir?.id ?? '';
        currentSession = firstInDir;
      }
      
      const visible = sorted.filter((s) => s.cwd === selectedDirectory);
      
      return {
        sessions,
        sessionStatuses,
        sortedSessions: sorted,
        projectDirectories: directories,
        selectedSessionId,
        currentSession,
        visibleSessions: visible,
      };
    });
  },
  
  setSelectedDirectory: (cwd) => {
    set((state) => ({
      selectedDirectory: cwd,
      visibleSessions: state.sortedSessions.filter((s) => s.cwd === cwd),
    }));
  },
  
  setSelectedSessionId: (id) => {
    set((state) => ({
      selectedSessionId: id,
      currentSession: state.sessions.find((s) => s.id === id),
    }));
  },
}));
