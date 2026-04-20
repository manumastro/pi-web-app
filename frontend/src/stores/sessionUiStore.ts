import { create } from 'zustand';
import { useSessionStore } from './sessionStore';
import type { SessionInfo } from '@/types';

interface SessionUiState {
  selectedDirectory: string;
  selectedSessionId: string;
  currentSession: SessionInfo | undefined;
  visibleSessions: SessionInfo[];
  setSelectedDirectory: (cwd: string) => void;
  setSelectedSessionId: (id: string) => void;
  syncSessionSelection: (cwd: string, sessionId: string) => void;
}

function getVisibleSessions(cwd: string): SessionInfo[] {
  return useSessionStore.getState().sessions.filter((session) => session.cwd === cwd);
}

function getCurrentSession(sessionId: string): SessionInfo | undefined {
  return useSessionStore.getState().sessions.find((session) => session.id === sessionId);
}

function deriveCurrentSession(selectedSessionId: string): SessionInfo | undefined {
  return selectedSessionId ? getCurrentSession(selectedSessionId) : undefined;
}

export const useSessionUiStore = create<SessionUiState>((set) => ({
  selectedDirectory: '/',
  selectedSessionId: '',
  currentSession: undefined,
  visibleSessions: [],

  setSelectedDirectory: (cwd) => {
    const visibleSessions = getVisibleSessions(cwd);
    set((state) => ({
      selectedDirectory: cwd,
      visibleSessions,
      currentSession: deriveCurrentSession(state.selectedSessionId),
    }));
  },

  setSelectedSessionId: (id) => {
    set((state) => ({
      selectedSessionId: id,
      currentSession: getCurrentSession(id),
      visibleSessions: getVisibleSessions(state.selectedDirectory),
    }));
  },

  syncSessionSelection: (cwd, sessionId) => {
    const visibleSessions = getVisibleSessions(cwd);
    set({
      selectedDirectory: cwd,
      selectedSessionId: sessionId,
      visibleSessions,
      currentSession: sessionId ? getCurrentSession(sessionId) : undefined,
    });
  },
}));
