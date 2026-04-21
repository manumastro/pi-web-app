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

      if (key.startsWith('pi-web-app:') || key.startsWith('pi.dir.')) {
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
