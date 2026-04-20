import { create } from 'zustand';

export type SessionMemoryState = {
  viewportAnchor: number;
  isStreaming: boolean;
  streamStartTime?: number;
  lastAccessedAt: number;
  backgroundMessageCount: number;
  loadedTurnCount?: number;
  hasMoreAbove?: boolean;
  hasMoreTurnsAbove?: boolean;
  historyLoading?: boolean;
  historyComplete?: boolean;
  historyLimit?: number;
  totalAvailableMessages?: number;
  streamingCooldownUntil?: number;
  isZombie?: boolean;
  lastUserMessageAt?: number;
};

export type ViewportState = {
  sessionMemoryState: Map<string, SessionMemoryState>;
  isSyncing: boolean;
  updateViewportAnchor: (sessionId: string, anchor: number) => void;
};

export const useViewportStore = create<ViewportState>()((set) => ({
  sessionMemoryState: new Map(),
  isSyncing: false,

  updateViewportAnchor: (sessionId, anchor) => set((state) => {
    const next = new Map(state.sessionMemoryState);
    const existing = next.get(sessionId) ?? {
      viewportAnchor: 0,
      isStreaming: false,
      lastAccessedAt: Date.now(),
      backgroundMessageCount: 0,
    };
    next.set(sessionId, { ...existing, viewportAnchor: anchor, lastAccessedAt: Date.now() });
    return { sessionMemoryState: next };
  }),
}));
