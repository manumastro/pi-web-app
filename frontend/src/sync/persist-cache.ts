import type { SyncDirectoryState } from './types';

export type PersistedDirCache = {
  vcs: SyncDirectoryState['vcs'];
  projectMeta: Record<string, unknown> | undefined;
  icon: string | undefined;
};

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function storagePrefix(directory: string): string {
  const head = directory.slice(0, 12).replace(/[^a-zA-Z0-9]/g, '_');
  return `pi.dir.${head}.${hashCode(directory)}`;
}

type CacheKey = 'vcs' | 'projectMeta' | 'icon';

function cacheKey(directory: string, key: CacheKey): string {
  return `${storagePrefix(directory)}.${key}`;
}

function readCache<T>(directory: string, key: CacheKey): T | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(cacheKey(directory, key));
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeCache<T>(directory: string, key: CacheKey, value: T | undefined): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return;
    }
    const k = cacheKey(directory, key);
    if (value === undefined) {
      storage.removeItem(k);
    } else {
      storage.setItem(k, JSON.stringify(value));
    }
  } catch {
    // ignore quota / storage errors
  }
}

function clearCache(directory: string): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return;
    }
    const prefix = storagePrefix(directory);
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function readDirCache(directory: string): PersistedDirCache {
  return {
    vcs: readCache<SyncDirectoryState['vcs']>(directory, 'vcs'),
    projectMeta: readCache<Record<string, unknown>>(directory, 'projectMeta'),
    icon: readCache<string>(directory, 'icon'),
  };
}

export function persistVcs(directory: string, vcs: SyncDirectoryState['vcs']): void {
  writeCache(directory, 'vcs', vcs);
}

export function persistProjectMeta(directory: string, meta: Record<string, unknown> | undefined): void {
  writeCache(directory, 'projectMeta', meta);
}

export function persistIcon(directory: string, icon: string | undefined): void {
  writeCache(directory, 'icon', icon);
}

export function clearDirCache(directory: string): void {
  clearCache(directory);
}
