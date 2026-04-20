import { create, type StoreApi } from 'zustand';
import { INITIAL_SYNC_DIRECTORY_STATE, type SyncDirectoryState } from './types';

export type DirectoryStore = SyncDirectoryState & {
  patch: (partial: Partial<SyncDirectoryState>) => void;
  replace: (next: SyncDirectoryState) => void;
};

function createDirectoryStore(): StoreApi<DirectoryStore> {
  return create<DirectoryStore>()((set) => ({
    ...INITIAL_SYNC_DIRECTORY_STATE,
    patch: (partial) => set(partial),
    replace: (next) => set(next),
  }));
}

export class ChildStoreManager {
  readonly children = new Map<string, StoreApi<DirectoryStore>>();
  private readonly registrySubscribers = new Set<() => void>();

  private onBootstrap?: (directory: string) => void;
  private onDispose?: (directory: string) => void;

  configure(callbacks: { onBootstrap?: (directory: string) => void; onDispose?: (directory: string) => void }) {
    this.onBootstrap = callbacks.onBootstrap;
    this.onDispose = callbacks.onDispose;
  }

  private notifyRegistrySubscribers(): void {
    for (const subscriber of this.registrySubscribers) {
      subscriber();
    }
  }

  ensureChild(directory: string, options?: { bootstrap?: boolean }): StoreApi<DirectoryStore> {
    if (!directory) {
      throw new Error('No directory provided to ensureChild');
    }

    let store = this.children.get(directory);
    if (!store) {
      store = createDirectoryStore();
      this.children.set(directory, store);
      this.notifyRegistrySubscribers();
    }

    const shouldBootstrap = options?.bootstrap ?? true;
    if (shouldBootstrap && store.getState().status === 'loading') {
      this.onBootstrap?.(directory);
    }

    return store;
  }

  getChild(directory: string): StoreApi<DirectoryStore> | undefined {
    return this.children.get(directory);
  }

  getState(directory: string): SyncDirectoryState | undefined {
    return this.children.get(directory)?.getState();
  }

  update(directory: string, fn: (state: SyncDirectoryState) => Partial<SyncDirectoryState>): void {
    const store = this.children.get(directory);
    if (!store) {
      return;
    }

    const current = store.getState();
    store.setState(fn(current));
  }

  replace(directory: string, next: SyncDirectoryState): void {
    const store = this.ensureChild(directory, { bootstrap: false });
    store.setState({
      ...next,
      patch: store.getState().patch,
      replace: store.getState().replace,
    } as DirectoryStore);
  }

  disposeDirectory(directory: string): boolean {
    if (!this.children.has(directory)) {
      return false;
    }

    this.children.delete(directory);
    this.notifyRegistrySubscribers();
    this.onDispose?.(directory);
    return true;
  }

  disposeAll(): void {
    this.children.clear();
    this.notifyRegistrySubscribers();
  }

  subscribeRegistry(listener: () => void): () => void {
    this.registrySubscribers.add(listener);
    return () => {
      this.registrySubscribers.delete(listener);
    };
  }

  subscribeAll(listener: () => void): () => void {
    const storeUnsubscribers = new Map<string, () => void>();

    const syncStoreSubscriptions = () => {
      const activeDirectories = new Set(this.children.keys());

      for (const [directory, unsubscribe] of storeUnsubscribers.entries()) {
        if (activeDirectories.has(directory)) {
          continue;
        }
        unsubscribe();
        storeUnsubscribers.delete(directory);
      }

      for (const [directory, store] of this.children.entries()) {
        if (storeUnsubscribers.has(directory)) {
          continue;
        }
        storeUnsubscribers.set(directory, store.subscribe(listener));
      }
    };

    syncStoreSubscriptions();
    const unsubscribeRegistry = this.subscribeRegistry(() => {
      syncStoreSubscriptions();
      listener();
    });

    return () => {
      unsubscribeRegistry();
      for (const unsubscribe of storeUnsubscribers.values()) {
        unsubscribe();
      }
      storeUnsubscribers.clear();
    };
  }
}
