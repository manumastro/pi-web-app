import { useState, useCallback, useEffect, useRef } from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useThinkingLevelStore, type ThinkingLevel, THINKING_LEVELS, THINKING_LEVEL_LABELS, DRAFT_THINKING_LEVEL_KEY } from '@/stores/thinkingLevelStore';
import { useConfigStore } from '@/stores/useConfigStore';

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
  const newSessionDraftOpen = useSessionUIStore((s) => s.newSessionDraft.open);
  const storeGetLevel = useThinkingLevelStore((s) => s.getLevel);
  const storeSetLevel = useThinkingLevelStore((s) => s.setLevel);
  const storeGetLastThinkingForModel = useThinkingLevelStore((s) => s.getLastThinkingForModel);
  const storeGetLastGlobalPair = useThinkingLevelStore((s) => s.getLastGlobalPair);
  const storeRememberModelThinking = useThinkingLevelStore((s) => s.rememberModelThinking);
  const currentProviderId = useConfigStore((s) => s.currentProviderId);
  const currentModelId = useConfigStore((s) => s.currentModelId);
  const getModelMetadata = useConfigStore((s) => s.getModelMetadata);
  const [availableLevels, setAvailableLevels] = useState<ThinkingLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchRef = useRef<AbortController | null>(null);

  const storeKey = currentSessionId ?? (newSessionDraftOpen ? DRAFT_THINKING_LEVEL_KEY : null);

  // Read current level from local store
  const currentLevel = storeKey ? storeGetLevel(storeKey) : null;

  const supportsThinkingForCurrentModel = Boolean(
    currentProviderId
    && currentModelId
    && getModelMetadata(currentProviderId, currentModelId)?.reasoning,
  );

  const currentModelKey = currentProviderId && currentModelId
    ? `${currentProviderId}/${currentModelId}`.toLowerCase()
    : null;

  const refresh = useCallback(async () => {
    if (!currentSessionId) {
      if (newSessionDraftOpen && supportsThinkingForCurrentModel) {
        setAvailableLevels(THINKING_LEVELS);
      } else {
        setAvailableLevels([]);
      }
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
        if (Array.isArray(data.levels) && data.levels.length > 0) {
          setAvailableLevels(data.levels as ThinkingLevel[]);
        } else {
          setAvailableLevels(supportsThinkingForCurrentModel ? THINKING_LEVELS : []);
        }
        // Sync backend's current level with local store if available
        if (data.current && data.current !== storeGetLevel(currentSessionId)) {
          storeSetLevel(currentSessionId, data.current as ThinkingLevel);
        }
        if (data.current && currentProviderId && currentModelId) {
          storeRememberModelThinking(currentProviderId, currentModelId, data.current as ThinkingLevel);
        }
      } else {
        setAvailableLevels(supportsThinkingForCurrentModel ? THINKING_LEVELS : []);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setAvailableLevels(supportsThinkingForCurrentModel ? THINKING_LEVELS : []);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [currentSessionId, newSessionDraftOpen, supportsThinkingForCurrentModel, storeGetLevel, storeSetLevel, currentProviderId, currentModelId, storeRememberModelThinking]);

  const setLevel = useCallback(async (level: ThinkingLevel) => {
    if (!storeKey) return;
    if (!currentSessionId) {
      storeSetLevel(storeKey, level);
      return;
    }
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
  }, [currentSessionId, storeKey, storeSetLevel]);

  // Refresh when session changes
  useEffect(() => {
    void refresh();
    return () => {
      fetchRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (!storeKey || !supportsThinkingForCurrentModel || !currentProviderId || !currentModelId) return;
    const current = storeGetLevel(storeKey);
    if (current) return;

    const fromModel = storeGetLastThinkingForModel(currentProviderId, currentModelId);
    const globalPair = storeGetLastGlobalPair();
    const fallback = fromModel ?? (globalPair.modelKey === currentModelKey ? globalPair.thinking : null);
    if (fallback) {
      storeSetLevel(storeKey, fallback);
    }
  }, [
    storeKey,
    supportsThinkingForCurrentModel,
    currentProviderId,
    currentModelId,
    currentModelKey,
    storeGetLevel,
    storeGetLastThinkingForModel,
    storeGetLastGlobalPair,
    storeSetLevel,
  ]);

  const supported = supportsThinkingForCurrentModel;

  return {
    currentLevel,
    availableLevels,
    loading,
    supported,
    setLevel,
    refresh,
  };
}
