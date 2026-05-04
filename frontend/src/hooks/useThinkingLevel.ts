import { useState, useCallback, useEffect, useRef } from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useThinkingLevelStore, type ThinkingLevel, THINKING_LEVELS, THINKING_LEVEL_LABELS } from '@/stores/thinkingLevelStore';

export type { ThinkingLevel };
export { THINKING_LEVELS, THINKING_LEVEL_LABELS };

export interface ThinkingLevelState {
  /** Currently active thinking level for the session (null = not set / not supported) */
  currentLevel: ThinkingLevel | null;
  /** Available thinking levels */
  availableLevels: ThinkingLevel[];
  /** Whether we're fetching levels */
  loading: boolean;
  /** Whether the current model supports thinking levels */
  supported: boolean;
  /** Set thinking level for the current session */
  setLevel: (level: ThinkingLevel) => Promise<void>;
  /** Fetch available thinking levels */
  refresh: () => Promise<void>;
}

/**
 * Hook to manage thinking levels for the current session.
 * Communicates with the backend's /api/session/:id/thinking-levels and /api/session/:id/thinking endpoints.
 */
export function useThinkingLevel(): ThinkingLevelState {
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
  const storeGetLevel = useThinkingLevelStore((s) => s.getLevel);
  const storeSetLevel = useThinkingLevelStore((s) => s.setLevel);
  const [availableLevels, setAvailableLevels] = useState<ThinkingLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchRef = useRef<AbortController | null>(null);

  // Read current level from local store
  const currentLevel = currentSessionId ? storeGetLevel(currentSessionId) : null;

  const refresh = useCallback(async () => {
    if (!currentSessionId) {
      setAvailableLevels([]);
      return;
    }

    // Abort any in-flight request
    fetchRef.current?.abort();
    const controller = new AbortController();
    fetchRef.current = controller;

    setLoading(true);
    try {
      const response = await fetch(`/api/session/${encodeURIComponent(currentSessionId)}/thinking-levels`, {
        signal: controller.signal,
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.levels)) {
          setAvailableLevels(data.levels as ThinkingLevel[]);
        }
        // Sync backend's current level with local store if available
        if (data.current && data.current !== storeGetLevel(currentSessionId)) {
          storeSetLevel(currentSessionId, data.current as ThinkingLevel);
        }
      } else {
        setAvailableLevels([]);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setAvailableLevels([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [currentSessionId, storeGetLevel, storeSetLevel]);

  const setLevel = useCallback(async (level: ThinkingLevel) => {
    if (!currentSessionId) return;
    try {
      const response = await fetch(`/api/session/${encodeURIComponent(currentSessionId)}/thinking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      });
      if (response.ok) {
        storeSetLevel(currentSessionId, level);
      }
    } catch (err) {
      console.error('[useThinkingLevel] Failed to set thinking level:', err);
    }
  }, [currentSessionId, storeSetLevel]);

  // Refresh when session changes
  useEffect(() => {
    void refresh();
    return () => {
      fetchRef.current?.abort();
    };
  }, [refresh]);

  const supported = availableLevels.length > 0;

  return {
    currentLevel,
    availableLevels,
    loading,
    supported,
    setLevel,
    refresh,
  };
}
