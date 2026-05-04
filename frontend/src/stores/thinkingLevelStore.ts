import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export const THINKING_LEVELS: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
export const DRAFT_THINKING_LEVEL_KEY = '__draft__';

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
};

const THINKING_STORE_VERSION = 2;

const toModelKey = (providerId: string, modelId: string): string => `${providerId}/${modelId}`.toLowerCase();

interface ThinkingLevelStoreState {
  /** Per-session/draft thinking level selections */
  sessionLevels: Record<string, ThinkingLevel | null>;
  /** Last known thinking level by model key */
  lastThinkingByModelKey: Record<string, ThinkingLevel | null>;
  /** Last global model key used for prompt send */
  lastGlobalModelKey: string | null;
  /** Last global thinking paired to lastGlobalModelKey */
  lastGlobalThinking: ThinkingLevel | null;

  getLevel: (sessionId: string) => ThinkingLevel | null;
  setLevel: (sessionId: string, level: ThinkingLevel | null) => void;

  rememberModelThinking: (providerId: string, modelId: string, level: ThinkingLevel | null) => void;
  rememberGlobalPair: (providerId: string, modelId: string, level: ThinkingLevel | null) => void;
  getLastThinkingForModel: (providerId: string, modelId: string) => ThinkingLevel | null;
  getLastGlobalPair: () => { modelKey: string | null; thinking: ThinkingLevel | null };

  moveDraftToSession: (sessionId: string) => void;
  clearDraft: () => void;
}

export const useThinkingLevelStore = create<ThinkingLevelStoreState>()(
  persist(
    (set, get) => ({
      sessionLevels: {},
      lastThinkingByModelKey: {},
      lastGlobalModelKey: null,
      lastGlobalThinking: null,

      getLevel: (sessionId: string) => get().sessionLevels[sessionId] ?? null,

      setLevel: (sessionId: string, level: ThinkingLevel | null) => {
        set((state) => ({
          sessionLevels: {
            ...state.sessionLevels,
            [sessionId]: level,
          },
        }));
      },

      rememberModelThinking: (providerId: string, modelId: string, level: ThinkingLevel | null) => {
        const modelKey = toModelKey(providerId, modelId);
        set((state) => ({
          lastThinkingByModelKey: {
            ...state.lastThinkingByModelKey,
            [modelKey]: level,
          },
        }));
      },

      rememberGlobalPair: (providerId: string, modelId: string, level: ThinkingLevel | null) => {
        const modelKey = toModelKey(providerId, modelId);
        set((state) => ({
          lastGlobalModelKey: modelKey,
          lastGlobalThinking: level,
          lastThinkingByModelKey: {
            ...state.lastThinkingByModelKey,
            [modelKey]: level,
          },
        }));
      },

      getLastThinkingForModel: (providerId: string, modelId: string) => {
        const modelKey = toModelKey(providerId, modelId);
        return get().lastThinkingByModelKey[modelKey] ?? null;
      },

      getLastGlobalPair: () => ({
        modelKey: get().lastGlobalModelKey,
        thinking: get().lastGlobalThinking,
      }),

      moveDraftToSession: (sessionId: string) => {
        set((state) => {
          const draftLevel = state.sessionLevels[DRAFT_THINKING_LEVEL_KEY] ?? null;
          return {
            sessionLevels: {
              ...state.sessionLevels,
              [sessionId]: draftLevel,
            },
          };
        });
      },

      clearDraft: () => {
        set((state) => {
          if (!(DRAFT_THINKING_LEVEL_KEY in state.sessionLevels)) return state;
          const next = { ...state.sessionLevels };
          delete next[DRAFT_THINKING_LEVEL_KEY];
          return { sessionLevels: next };
        });
      },
    }),
    {
      name: 'pi-web-thinking-level-store',
      version: THINKING_STORE_VERSION,
      storage: createJSONStorage(() => getSafeStorage()),
    },
  ),
);
