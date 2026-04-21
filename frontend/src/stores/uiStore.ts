import { create } from 'zustand';
import { cacheGetItem, cacheSetItem } from '@/lib/frontend-cache';
import type { ModelInfo, ThinkingLevel } from '@/types';

interface UIState {
  // Sidebar state
  sidebarOpen: boolean;
  modelFilter: string;
  showReasoningTraces: boolean;

  // Model state
  models: ModelInfo[];
  activeModelKey: string;
  availableThinkingLevels: ThinkingLevel[];
  activeThinkingLevel?: ThinkingLevel;

  // Composer state
  prompt: string;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setModelFilter: (filter: string) => void;
  setShowReasoningTraces: (value: boolean) => void;
  setModels: (models: ModelInfo[]) => void;
  setActiveModel: (key: string) => void;
  setThinkingConfig: (levels: ThinkingLevel[], active?: ThinkingLevel) => void;
  setPrompt: (prompt: string) => void;
}

const SHOW_REASONING_STORAGE_KEY = 'pi-web-app:show-reasoning-traces';

function readStoredShowReasoningTraces(): boolean {
  const raw = cacheGetItem(SHOW_REASONING_STORAGE_KEY);
  if (raw === null) {
    return true;
  }

  return raw !== 'false';
}

function persistShowReasoningTraces(value: boolean): void {
  cacheSetItem(SHOW_REASONING_STORAGE_KEY, value ? 'true' : 'false');
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  sidebarOpen: true,
  modelFilter: '',
  showReasoningTraces: readStoredShowReasoningTraces(),
  models: [],
  activeModelKey: '',
  availableThinkingLevels: [],
  activeThinkingLevel: undefined,
  prompt: '',

  // Actions
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setModelFilter: (modelFilter) => set({ modelFilter }),
  setShowReasoningTraces: (showReasoningTraces) => {
    persistShowReasoningTraces(showReasoningTraces);
    set({ showReasoningTraces });
  },

  setModels: (models) => {
    const active = models.find((m) => m.active && m.available)
      ?? models.find((m) => m.available)
      ?? models[0];
    set({
      models,
      activeModelKey: active?.key ?? '',
    });
  },

  setActiveModel: (activeModelKey) => set({ activeModelKey }),
  setThinkingConfig: (availableThinkingLevels, activeThinkingLevel) => set({ availableThinkingLevels, activeThinkingLevel }),
  setPrompt: (prompt) => set({ prompt }),
}));
