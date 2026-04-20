import { create } from 'zustand';
import { INITIAL_SYNC_GLOBAL_STATE, type SyncGlobalState } from './types';

export type GlobalSyncStore = SyncGlobalState & {
  actions: {
    set: (patch: Partial<SyncGlobalState>) => void;
    reset: () => void;
  };
};

export const useGlobalSyncStore = create<GlobalSyncStore>()((set) => ({
  ...INITIAL_SYNC_GLOBAL_STATE,
  actions: {
    set: (patch) => set(patch),
    reset: () => set(INITIAL_SYNC_GLOBAL_STATE),
  },
}));

export const selectReady = (state: GlobalSyncStore) => state.ready;
export const selectReload = (state: GlobalSyncStore) => state.reload;
export const selectDirectories = (state: GlobalSyncStore) => state.directories;
export const selectSessionsByDirectory = (state: GlobalSyncStore) => state.sessionsByDirectory;
