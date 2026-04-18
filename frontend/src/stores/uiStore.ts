import { create } from 'zustand';
import type { ModelInfo } from '@/types';

interface UIState {
  // Sidebar state
  sidebarOpen: boolean;
  modelFilter: string;
  
  // Model state
  models: ModelInfo[];
  activeModelKey: string;
  
  // Composer state
  prompt: string;
  
  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setModelFilter: (filter: string) => void;
  setModels: (models: ModelInfo[]) => void;
  setActiveModel: (key: string) => void;
  setPrompt: (prompt: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  sidebarOpen: true,
  modelFilter: '',
  models: [],
  activeModelKey: '',
  prompt: '',
  
  // Actions
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setModelFilter: (modelFilter) => set({ modelFilter }),
  
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
