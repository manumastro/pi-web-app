import { create } from 'zustand';

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export const THINKING_LEVELS: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
};

interface ThinkingLevelStoreState {
  /** Per-session thinking level selections */
  sessionLevels: Record<string, ThinkingLevel | null>;
  /** Get thinking level for a session */
  getLevel: (sessionId: string) => ThinkingLevel | null;
  /** Set thinking level for a session */
  setLevel: (sessionId: string, level: ThinkingLevel | null) => void;
}

export const useThinkingLevelStore = create<ThinkingLevelStoreState>((set, get) => ({
  sessionLevels: {},

  getLevel: (sessionId: string) => {
    return get().sessionLevels[sessionId] ?? null;
  },

  setLevel: (sessionId: string, level: ThinkingLevel | null) => {
    set((state) => ({
      sessionLevels: {
        ...state.sessionLevels,
        [sessionId]: level,
      },
    }));
  },
}));
