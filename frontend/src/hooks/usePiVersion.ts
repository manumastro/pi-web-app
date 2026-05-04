import { useSyncExternalStore } from 'react';

type PiVersionStore = {
  piVersion: string | null;
  loading: boolean;
};

let storeState: PiVersionStore = { piVersion: null, loading: false };
let listeners: Set<() => void> = new Set();
let fetchPromise: Promise<void> | null = null;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): PiVersionStore {
  return storeState;
}

function emitChange(): void {
  listeners.forEach((cb) => cb());
}

async function fetchPiVersion(): Promise<void> {
  if (fetchPromise) return fetchPromise;
  if (storeState.piVersion) return;

  storeState = { ...storeState, loading: true };
  emitChange();

  fetchPromise = (async () => {
    try {
      const response = await fetch('/api/system/info');
      if (response.ok) {
        const data = await response.json();
        if (typeof data.piVersion === 'string' && data.piVersion.trim()) {
          storeState = { piVersion: data.piVersion, loading: false };
        } else {
          storeState = { piVersion: null, loading: false };
        }
      } else {
        storeState = { piVersion: null, loading: false };
      }
    } catch {
      storeState = { piVersion: null, loading: false };
    }
    emitChange();
    fetchPromise = null;
  })();

  return fetchPromise;
}

/**
 * Hook that returns the Pi version, fetching it once from /api/system/info.
 * Uses useSyncExternalStore for zero-cost re-renders.
 */
export function usePiVersion(): PiVersionStore {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Trigger fetch on first mount
  if (!state.piVersion && !state.loading && !fetchPromise) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchPiVersion();
  }

  return state;
}
