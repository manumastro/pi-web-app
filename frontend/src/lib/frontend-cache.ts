const ENABLE_FRONTEND_CACHE = (import.meta.env.VITE_ENABLE_FRONTEND_CACHE ?? 'false').toLowerCase() === 'true';

export function isFrontendCacheEnabled(): boolean {
  return ENABLE_FRONTEND_CACHE;
}

export function cacheGetItem(key: string): string | null {
  if (!ENABLE_FRONTEND_CACHE || typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function cacheSetItem(key: string, value: string): void {
  if (!ENABLE_FRONTEND_CACHE || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

export function cacheRemoveItem(key: string): void {
  if (!ENABLE_FRONTEND_CACHE || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

/** Cache keys managed via cacheGetItem / cacheSetItem (not user preferences). */
const CACHE_KEYS = new Set([
  'pi-web-app:projects',
  'pi-web-app:active-project',
]);

/**
 * Clear only frontend cache entries (projects and sync-directory state).
 * User preferences (favorites, recents, collapsed providers, workspace panel,
 * reasoning traces) are deliberately left untouched.
 */
export function clearFrontendCacheStorage(): void {
  if (ENABLE_FRONTEND_CACHE || typeof window === 'undefined') {
    return;
  }

  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) {
        continue;
      }

      if (CACHE_KEYS.has(key) || key.startsWith('pi.dir.')) {
        keys.push(key);
      }
    }

    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    // ignore storage failures
  }
}
