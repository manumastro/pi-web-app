import type { ChildStoreManager } from './child-store';
import type { SyncDirectoryState, SyncSessionStatus } from './types';

let _childStores: ChildStoreManager | null = null;
let _directory = '';

export function setSyncRefs(childStores: ChildStoreManager, directory: string): void {
  _childStores = childStores;
  _directory = directory;
}

export function getSyncChildStores(): ChildStoreManager {
  if (!_childStores) {
    throw new Error('ChildStoreManager not initialized — is SyncProvider mounted?');
  }
  return _childStores;
}

export function getSyncDirectory(): string {
  return _directory;
}

export function getDirectoryState(directory?: string): SyncDirectoryState | undefined {
  const stores = _childStores;
  if (!stores) {
    return undefined;
  }
  const dir = directory || _directory;
  if (!dir) {
    return undefined;
  }
  return stores.getState(dir);
}

export function getSyncSessions(directory?: string) {
  return getDirectoryState(directory)?.session ?? [];
}

export function getAllSyncSessions() {
  const stores = _childStores;
  if (!stores) {
    return [];
  }

  const deduped = new Map<string, SyncDirectoryState['session'][number]>();
  for (const store of stores.children.values()) {
    for (const session of store.getState().session) {
      if (!session?.id) continue;
      deduped.set(session.id, session);
    }
  }
  return Array.from(deduped.values());
}

export function getSyncMessages(sessionId: string, directory?: string) {
  return getDirectoryState(directory)?.message[sessionId] ?? [];
}

export function getSyncSessionStatus(sessionId: string, directory?: string): SyncSessionStatus | undefined {
  return getDirectoryState(directory)?.session_status[sessionId];
}
