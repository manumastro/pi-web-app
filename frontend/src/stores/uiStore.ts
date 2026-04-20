import { create } from 'zustand';
import type { ModelInfo } from '@/types';

interface UIState {
  // Sidebar state
  sidebarOpen: boolean;
  modelFilter: string;
  showReasoningTraces: boolean;
  
  // Model state
  models: ModelInfo[];
  activeModelKey: string;
  
  // Composer state
  prompt: string;
  
  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setModelFilter: (filter: string) => void;
  setShowReasoningTraces: (value: boolean) => void;
  setModels: (models: ModelInfo[]) => void;
  setActiveModel: (key: string) => void;
  setPrompt: (prompt: string) => void;
}

const SHOW_REASONING_STORAGE_KEY = 'pi-web-app:show-reasoning-traces';

function readStoredShowReasoningTraces(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(SHOW_REASONING_STORAGE_KEY);
    if (raw === null) {
      return true;
    }

    return raw !== 'false';
  } catch {
    return true;
  }
}

function persistShowReasoningTraces(value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SHOW_REASONING_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // ignored
  }
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  sidebarOpen: true,
  modelFilter: '',
  showReasoningTraces: readStoredShowReasoningTraces(),
  models: [],
  activeModelKey: '',
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
  setPrompt: (prompt) => set({ prompt }),
}));
