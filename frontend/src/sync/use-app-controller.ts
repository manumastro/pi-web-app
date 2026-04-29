import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiRequest } from '@/api';
import type { SsePayload } from '@/sync/conversation';
import { useSessionStream } from '@/hooks/useSessionStream';
import { hydrateSelectedSessionSnapshot, normalizeSelectedSessionConversation, reconcileSessionDirectories, upsertDirectorySession } from './bootstrap';
import { reduceSessionLifecyclePayload, reduceSessionLifecyclePayloads } from './event-reducer';
import { markSessionViewed } from './notification-store';
import { useCurrentSessionActivity, setSyncDirectory } from './sync-context';
import { useStreamingSession, type StreamPhase } from './streaming';
import { getVisualStreamingState, isRunningSessionStatus } from './sessionActivity';
import { useInputStore } from './input-store';
import { useSync } from './use-sync';
import { useChatStore } from '@/stores/chatStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { useUIStore } from '@/stores/uiStore';
import { getProjectLabel, normalizeProjectPath } from '@/lib/path';
import type { DirectoryInfo, ModelInfo, SessionInfo, StreamingState, ThinkingLevel } from '@/types';

function getQueryParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

function setQueryParams(params: { cwd?: string; sessionId?: string }): void {
  const search = new URLSearchParams(window.location.search);
  if (params.cwd !== undefined) search.set('cwd', params.cwd);
  if (params.sessionId !== undefined) search.set('sessionId', params.sessionId);
  const nextSearch = search.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
}

function formatDirectoryLabel(cwd: string, homeDir: string): string {
  return getProjectLabel(cwd, homeDir);
}

interface RelayStatusPayload {
  viewers: number;
  sessions: Record<string, number>;
  transport: string;
  path: string;
}

interface AppConfigPayload {
  homeDir: string;
  systemd?: {
    restartEnabled?: boolean;
    service?: string;
  };
}

// Module-level model cache to avoid redundant fetches on session switches.
const modelCacheBySession = new Map<string, { models: ModelInfo[]; at: number }>();
const MODEL_CACHE_TTL_MS = 60_000;

function getCachedModels(sessionId: string): ModelInfo[] | undefined {
  const entry = modelCacheBySession.get(sessionId);
  if (!entry) return undefined;
  if (Date.now() - entry.at > MODEL_CACHE_TTL_MS) {
    modelCacheBySession.delete(sessionId);
    return undefined;
  }
  return entry.models;
}

function setCachedModels(sessionId: string, models: ModelInfo[]): void {
  modelCacheBySession.set(sessionId, { models, at: Date.now() });
}

export type AppController = {
  conversation: ReturnType<typeof useChatStore.getState>['conversation'];
  streaming: StreamingState;
  statusMessage: string;
  error: string;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  models: ModelInfo[];
  activeModelKey: string;
  showReasoningTraces: boolean;
  relayStatusMessage: string;
  relayConnected: boolean;
  availableThinkingLevels: ThinkingLevel[];
  activeThinkingLevel?: ThinkingLevel;
  thinkingLevelError: string;
  prompt: string;
  setPrompt: (value: string) => void;
  projectDirectories: DirectoryInfo[];
  selectedDirectory: string;
  selectedSessionId: string;
  currentSession: SessionInfo | undefined;
  currentDirectoryLabel: string;
  visibleSessions: SessionInfo[];
  homeDirectory: string;
  currentSessionActivity: ReturnType<typeof useCurrentSessionActivity>;
  interactionStreaming: StreamingState;
  activeStreamingMessageId?: string;
  activeStreamingPhase?: StreamPhase;
  handleSend: () => Promise<void>;
  handleAbort: () => Promise<void>;
  handleCreateSession: () => Promise<void>;
  handleDeleteSession: (targetId: string) => Promise<void>;
  handleDirectorySelect: (nextDir: string) => Promise<void>;
  handleProjectAdd: (path: string) => boolean;
  handleProjectRemove: (cwd: string) => Promise<void>;
  handleSessionRename: (sessionId: string, title: string) => Promise<void>;
  handleSessionSelect: (targetId: string) => Promise<void>;
  handleModelSelect: (modelKey: string) => Promise<void>;
  handleThinkingLevelSelect: (thinkingLevel: ThinkingLevel) => Promise<void>;
  systemdRestartEnabled: boolean;
  handleSystemdRestart: () => Promise<void>;
};

export function useAppController(): AppController {
  const {
    conversation,
    streaming,
    statusMessage,
    error,
    setConversation,
    setStreaming,
    setStatusMessage,
    setError,
  } = useChatStore();

  const {
    sessions,
    setSessions,
    updateSession,
  } = useSessionStore();

  const {
    currentSession,
    visibleSessions,
    selectedDirectory,
    selectedSessionId,
    setSelectedDirectory,
    setSelectedSessionId,
  } = useSessionUiStore();

  const {
    createSession,
    deleteSession: removeSession,
    updateSessionTitle,
    updateSessionModel,
    updateSessionThinkingLevel,
    abortCurrentOperation,
    sendPrompt,
  } = useSync();

  const {
    homeDirectory,
    projects,
    hydrate: hydrateProjects,
    addProject,
    removeProject,
    selectProject,
  } = useProjectStore();

  const {
    sidebarOpen,
    toggleSidebar,
    models,
    setModels,
    activeModelKey,
    showReasoningTraces,
    availableThinkingLevels,
    activeThinkingLevel,
    setThinkingConfig,
  } = useUIStore();

  const { pendingInputText, setPendingInputText } = useInputStore();
  const prompt = pendingInputText ?? '';
  const [thinkingLevelError, setThinkingLevelError] = useState('');
  const [relayStatusMessage, setRelayStatusMessage] = useState('Relay connecting');
  const [relayConnected, setRelayConnected] = useState(false);
  const [systemdRestartEnabled, setSystemdRestartEnabled] = useState(false);
  const relayPollRef = useRef<{ intervalId: number | undefined; failures: number }>({ intervalId: undefined, failures: 0 });
  const doneReconcileAtRef = useRef<Map<string, number>>(new Map());

  const projectDirectories = useMemo<DirectoryInfo[]>(() => {
    const sessionCounts = new Map<string, number>();
    const updatedAtByPath = new Map<string, string>();

    for (const session of sessions) {
      sessionCounts.set(session.cwd, (sessionCounts.get(session.cwd) ?? 0) + 1);
      const currentUpdatedAt = updatedAtByPath.get(session.cwd);
      if (!currentUpdatedAt || session.updatedAt > currentUpdatedAt) {
        updatedAtByPath.set(session.cwd, session.updatedAt);
      }
    }

    const nextProjects = new Map<string, DirectoryInfo>();

    for (const project of projects) {
      nextProjects.set(project.path, {
        cwd: project.path,
        label: formatDirectoryLabel(project.path, homeDirectory),
        sessionCount: sessionCounts.get(project.path) ?? 0,
        updatedAt: updatedAtByPath.get(project.path) ?? project.updatedAt,
      });
    }

    for (const session of sessions) {
      if (!nextProjects.has(session.cwd)) {
        nextProjects.set(session.cwd, {
          cwd: session.cwd,
          label: formatDirectoryLabel(session.cwd, homeDirectory),
          sessionCount: sessionCounts.get(session.cwd) ?? 0,
          updatedAt: updatedAtByPath.get(session.cwd) ?? session.updatedAt,
        });
      }
    }

    return Array.from(nextProjects.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [homeDirectory, projects, sessions]);

  const currentDirectory = currentSession?.cwd ?? selectedDirectory;
  const currentDirectoryLabel = formatDirectoryLabel(currentDirectory, homeDirectory);
  const currentSessionActivity = useCurrentSessionActivity();
  const streamingSession = useStreamingSession(selectedSessionId || undefined);
  const interactionStreaming = getVisualStreamingState(
    currentSession?.status ?? null,
    streaming,
    streamingSession.phase,
  );

  const refreshModels = useCallback(async (selSessionId?: string): Promise<ModelInfo[]> => {
    if (!selSessionId) {
      setModels([]);
      return [];
    }
    const cached = getCachedModels(selSessionId);
    if (cached) {
      setModels(cached);
      return cached;
    }
    const payload = await apiGet<{ models: unknown[] }>(`/api/models?sessionId=${encodeURIComponent(selSessionId)}`);
    const mapped: ModelInfo[] = (payload.models ?? []).map((m: unknown) => {
      const model = m as Record<string, unknown>;
      return {
        key: String(model.key ?? ''),
        id: String(model.id ?? ''),
        label: String(model.name ?? model.key?.toString().split('/').pop() ?? model.key ?? ''),
        available: Boolean(model.available),
        active: Boolean(model.isSelected),
        provider: model.provider ? String(model.provider) : undefined,
        reasoning: Boolean(model.reasoning),
        contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined,
        maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : undefined,
      };
    });
    setCachedModels(selSessionId, mapped);
    setModels(mapped);
    return mapped;
  }, []);

  const refreshThinkingLevels = useCallback(async (sessionId?: string): Promise<void> => {
    if (!sessionId) {
      setThinkingConfig([], undefined);
      setThinkingLevelError('');
      return;
    }

    try {
      const payload = await apiGet<{ currentLevel?: ThinkingLevel; availableLevels?: ThinkingLevel[] }>(
        `/api/models/session/thinking?sessionId=${encodeURIComponent(sessionId)}`,
      );
      setThinkingConfig(payload.availableLevels ?? [], payload.currentLevel);
      setThinkingLevelError('');
    } catch (cause) {
      setThinkingConfig([], undefined);
      const message = cause instanceof Error ? cause.message : 'Unable to load thinking levels';
      setThinkingLevelError(message);
      setError(message);
    }
  }, [setError, setThinkingConfig]);

  const loadSession = useCallback(async (targetSessionId: string): Promise<void> => {
    const payload = await apiGet<{ session: SessionInfo }>(`/api/sessions/${encodeURIComponent(targetSessionId)}`);
    setSyncDirectory(payload.session.cwd);
    hydrateSelectedSessionSnapshot(payload.session, {
      updateSession,
      setConversation,
      setSelectedSessionId,
      setSelectedDirectory,
      setStreaming,
      setStatusMessage,
    });
    upsertDirectorySession(payload.session);

    const projectState = useProjectStore.getState();
    const matchingProject = projectState.projects.find((project) => project.path === payload.session.cwd);
    if (matchingProject) {
      selectProject(matchingProject.id);
    } else {
      const added = addProject(payload.session.cwd);
      if (added) {
        selectProject(added.id);
      }
    }

    setQueryParams({ cwd: payload.session.cwd, sessionId: payload.session.id });
    markSessionViewed(payload.session.id);
    await refreshModels(payload.session.id);
    await refreshThinkingLevels(payload.session.id);
  }, [addProject, refreshModels, refreshThinkingLevels, selectProject, setConversation, setSelectedDirectory, setSelectedSessionId, setStatusMessage, setStreaming, updateSession]);

  const loadInitialState = useCallback(async (): Promise<void> => {
    setStatusMessage('Loading');
    try {
      const [configPayload, sessionsPayload] = await Promise.all([
        apiGet<AppConfigPayload>('/api/config'),
        apiGet<{ sessions: SessionInfo[] }>('/api/sessions'),
      ]);
      setSystemdRestartEnabled(Boolean(configPayload.systemd?.restartEnabled));

      hydrateProjects(configPayload.homeDir, sessionsPayload.sessions);
      setSessions(sessionsPayload.sessions);
      reconcileSessionDirectories(sessionsPayload.sessions);

      const querySessionId = getQueryParam('sessionId');
      const queryCwdRaw = getQueryParam('cwd');
      const normalizedQueryCwd = queryCwdRaw ? normalizeProjectPath(queryCwdRaw, configPayload.homeDir) ?? queryCwdRaw : '';
      const currentProjects = useProjectStore.getState().projects;
      const firstSessionDirectory = sessionsPayload.sessions[0]?.cwd ?? '';
      const targetDirectory = normalizedQueryCwd || firstSessionDirectory || currentProjects[0]?.path || configPayload.homeDir;

      if (normalizedQueryCwd && !currentProjects.some((project) => project.path === normalizedQueryCwd)) {
        const added = addProject(normalizedQueryCwd);
        if (added) {
          selectProject(added.id);
        }
      }

      const targetSessionId = querySessionId || sessionsPayload.sessions.find((session) => session.cwd === targetDirectory)?.id;

      if (targetSessionId) {
        setSyncDirectory(targetDirectory);
        await loadSession(targetSessionId);
      } else {
        setSyncDirectory(targetDirectory);
        setSelectedDirectory(targetDirectory);
        setSelectedSessionId('');
        setConversation([]);
        setQueryParams({ cwd: targetDirectory, sessionId: '' });
        setModels([]);
        setThinkingConfig([], undefined);
        setStatusMessage('Select or create a session');
      }

      setError('');
    } catch (cause) {
      setStatusMessage('Load failed');
      setError(cause instanceof Error ? cause.message : 'Unknown error');
      setStreaming('error');
    }
  }, [addProject, hydrateProjects, loadSession, refreshModels, selectProject, setConversation, setError, setSelectedDirectory, setSelectedSessionId, setSessions, setStatusMessage, setStreaming, setThinkingConfig]);

  useEffect(() => {
    void loadInitialState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshRelayStatus = useCallback(async (): Promise<void> => {
    try {
      const payload = await apiGet<RelayStatusPayload>('/api/relay/status');
      setRelayConnected(true);
      setRelayStatusMessage(`Relay connected · ${payload.viewers} viewer${payload.viewers === 1 ? '' : 's'}`);
      // Reset poll interval on success
      if (relayPollRef.current.intervalId != null) {
        clearInterval(relayPollRef.current.intervalId);
        relayPollRef.current.intervalId = window.setInterval(() => { void refreshRelayStatus(); }, 15_000);
        relayPollRef.current.failures = 0;
      }
    } catch {
      setRelayConnected(false);
      // Exponentially back off: 15s → 30s → 60s (capped)
      const nextInterval = Math.min(15_000 * Math.pow(2, relayPollRef.current.failures), 60_000);
      relayPollRef.current.failures += 1;
      if (relayPollRef.current.intervalId != null) {
        clearInterval(relayPollRef.current.intervalId);
      }
      relayPollRef.current.intervalId = window.setInterval(() => { void refreshRelayStatus(); }, nextInterval);
      if (relayPollRef.current.failures === 1) {
        setRelayStatusMessage('Relay unavailable');
      }
    }
  }, []);

  useEffect(() => {
    void refreshRelayStatus();
    relayPollRef.current.intervalId = window.setInterval(() => { void refreshRelayStatus(); }, 15_000);
    return () => {
      if (relayPollRef.current.intervalId != null) {
        clearInterval(relayPollRef.current.intervalId);
        relayPollRef.current.intervalId = undefined;
      }
    };
  }, [refreshRelayStatus]);

  const scheduleDoneReconcile = useCallback((sessionId: string): void => {
    const nowTs = Date.now();
    const lastTs = doneReconcileAtRef.current.get(sessionId) ?? 0;
    if (nowTs - lastTs <= 500) {
      return;
    }
    doneReconcileAtRef.current.set(sessionId, nowTs);
    const reconcile = async (attempt = 0): Promise<void> => {
      try {
        await loadSession(sessionId);
        return;
      } catch {
        // ignore and retry below
      }
      if (attempt < 3) {
        const delayMs = attempt === 0 ? 120 : attempt === 1 ? 600 : 1400;
        window.setTimeout(() => {
          void reconcile(attempt + 1);
        }, delayMs);
      }
    };
    void reconcile();
  }, [loadSession]);

  useSessionStream({
    sessionId: selectedSessionId || undefined,
    onPayload: (payload: SsePayload) => {
      const currentConversation = useChatStore.getState().conversation;
      const currentDirectory = useSessionUiStore.getState().selectedDirectory;
      reduceSessionLifecyclePayload(currentConversation, payload, {
        directory: currentDirectory,
        setConversation,
        updateSession,
        setStreaming,
        setStatusMessage,
        setError,
      });

      // Reconcile final assistant text from persisted session after done events.
      // This heals rare missed early chunks (UI shows truncated assistant until reload).
      const shouldReconcile = payload.sessionId
        && (
          payload.type === 'done'
          || (payload.type === 'status' && payload.status === 'idle')
        );

      if (shouldReconcile && payload.sessionId) {
        scheduleDoneReconcile(payload.sessionId);
      }
    },
    onPayloadBatch: (payloads: SsePayload[]) => {
      if (payloads.length === 0) {
        return;
      }
      const currentConversation = useChatStore.getState().conversation;
      const currentDirectory = useSessionUiStore.getState().selectedDirectory;
      reduceSessionLifecyclePayloads(currentConversation, payloads, {
        directory: currentDirectory,
        setConversation,
        updateSession,
        setStreaming,
        setStatusMessage,
        setError,
      });

      const reconcilePayload = payloads.find((payload) => payload.sessionId && (
        payload.type === 'done'
        || (payload.type === 'status' && payload.status === 'idle')
      ));
      if (reconcilePayload?.sessionId) {
        scheduleDoneReconcile(reconcilePayload.sessionId);
      }
    },
    onConnected: () => {
      const currentState = useChatStore.getState().streaming;
      const sessionRunning = currentSessionActivity.isWorking;
      setStreaming(sessionRunning ? 'streaming' : (currentState === 'error' ? 'error' : 'idle'));
      setStatusMessage(sessionRunning ? 'Working' : 'Connected');
      setRelayConnected(true);
      void refreshRelayStatus();
    },
    onConnectionLost: () => {
      setStreaming('connecting');
      setStatusMessage('Reconnecting');
      setRelayConnected(false);
      setRelayStatusMessage('Relay reconnecting');
    },
    onGapDetected: async ({ sessionId, lastEventId, nextEventId }) => {
      setStatusMessage('Recovering missed events');
      console.warn(`[sse] Recovered stream gap (${lastEventId} → ${nextEventId}) for session ${sessionId}`);
      try {
        await loadSession(sessionId);
      } catch (cause) {
        setStreaming('error');
        setStatusMessage('Recovery failed');
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
  });

  const handleSend = useCallback(async (): Promise<void> => {
    const text = prompt.trim();
    if (!text) return;

    const sent = await sendPrompt({ message: text, thinkingLevel: activeThinkingLevel });
    if (!sent) {
      const sessionId = useSessionUiStore.getState().selectedSessionId;
      if (sessionId) {
        try {
          await loadSession(sessionId);
          setError('');
        } catch {
          // keep the error state from the failed send if the reload also fails
        }
      }
    }
  }, [activeThinkingLevel, loadSession, prompt, sendPrompt, setError]);

  const handleAbort = useCallback(async (): Promise<void> => {
    const sessionId = useSessionUiStore.getState().selectedSessionId;
    if (!sessionId) return;
    await abortCurrentOperation(sessionId);
  }, [abortCurrentOperation]);

  const handleCreateSession = useCallback(async (): Promise<void> => {
    const currentModels = useUIStore.getState().models;
    const currentDirectory = useSessionUiStore.getState().selectedDirectory;
    const defaultModel = currentModels.find((m) => m.active)?.key ?? currentModels.find((m) => m.available)?.key ?? currentModels[0]?.key ?? '';
    const created = await createSession({ cwd: currentDirectory, model: defaultModel });
    if (!created) {
      setStatusMessage('Session creation failed');
      return;
    }

    const projectState = useProjectStore.getState();
    const matchingProject = projectState.projects.find((project) => project.path === created.cwd);
    if (matchingProject) {
      selectProject(matchingProject.id);
    } else {
      const added = addProject(created.cwd);
      if (added) {
        selectProject(added.id);
      }
    }

    setQueryParams({ cwd: created.cwd, sessionId: created.id });
    setConversation([]);
    setStatusMessage('Session ready');
    // loadSession already calls refreshModels + refreshThinkingLevels — no need to call again here.
    await loadSession(created.id);
  }, [addProject, createSession, loadSession, selectProject, setConversation, setStatusMessage]);

  const handleDeleteSession = useCallback(async (targetId: string): Promise<void> => {
    const { selectedSessionId, selectedDirectory } = useSessionUiStore.getState();
    const deleted = await removeSession(targetId);
    if (!deleted) {
      return;
    }

    if (selectedSessionId === targetId) {
      const nextVisibleSession = useSessionStore.getState().sessions.find((session) => session.cwd === selectedDirectory && session.id !== targetId);
      if (nextVisibleSession) {
        await loadSession(nextVisibleSession.id);
      } else {
        setSelectedSessionId('');
        setConversation([]);
        setQueryParams({ cwd: selectedDirectory, sessionId: '' });
        setStatusMessage('No session');
      }
    }
  }, [loadSession, removeSession, setConversation, setSelectedSessionId, setStatusMessage]);

  const handleDirectorySelect = useCallback(async (nextDir: string): Promise<void> => {
    const projectState = useProjectStore.getState();
    const matchingProject = projectState.projects.find((project) => project.path === nextDir);
    if (matchingProject) {
      selectProject(matchingProject.id);
    } else {
      const added = addProject(nextDir);
      if (added) {
        selectProject(added.id);
      }
    }

    const next = useSessionStore.getState().sessions.find((s) => s.cwd === nextDir);
    setSyncDirectory(nextDir);
    setSelectedDirectory(nextDir);
    if (next) {
      await loadSession(next.id);
    } else {
      setSelectedSessionId('');
      setConversation([]);
      setQueryParams({ cwd: nextDir, sessionId: '' });
      setStatusMessage('No sessions in this directory');
    }
  }, [addProject, loadSession, selectProject, setConversation, setSelectedDirectory, setSelectedSessionId, setStatusMessage]);

  const handleProjectAdd = useCallback((path: string): boolean => {
    const added = addProject(path);
    if (!added) {
      return false;
    }

    selectProject(added.id);
    setSyncDirectory(added.path);
    setSelectedDirectory(added.path);
    setSelectedSessionId('');
    setConversation([]);
    setQueryParams({ cwd: added.path, sessionId: '' });
    setStatusMessage('Project added');
    return true;
  }, [addProject, selectProject, setConversation, setSelectedDirectory, setSelectedSessionId, setStatusMessage]);

  const handleProjectRemove = useCallback(async (cwd: string): Promise<void> => {
    const project = useProjectStore.getState().projects.find((entry) => entry.path === cwd);
    if (!project) {
      return;
    }

    const wasActive = selectedDirectory === cwd;
    removeProject(project.id);

    if (wasActive) {
      const nextProject = useProjectStore.getState().getActiveProject();
      if (nextProject) {
        await handleDirectorySelect(nextProject.path);
        return;
      }

      setSyncDirectory(homeDirectory);
      setSelectedDirectory(homeDirectory);
      setSelectedSessionId('');
      setConversation([]);
      setQueryParams({ cwd: homeDirectory, sessionId: '' });
      setStatusMessage('Select or create a session');
    }
  }, [handleDirectorySelect, homeDirectory, removeProject, selectedDirectory, setConversation, setSelectedDirectory, setSelectedSessionId, setStatusMessage]);

  const handleSessionRename = useCallback(async (sessionId: string, title: string): Promise<void> => {
    const payload = await updateSessionTitle(sessionId, title);
    if (payload && selectedSessionId === sessionId) {
      setConversation(normalizeSelectedSessionConversation(payload));
    }
  }, [selectedSessionId, setConversation, updateSessionTitle]);

  const handleSessionSelect = useCallback(async (targetId: string): Promise<void> => {
    await loadSession(targetId);
    setStatusMessage('Connected');
  }, [loadSession, setStatusMessage]);

  const handleModelSelect = useCallback(async (modelKey: string): Promise<void> => {
    const currentSessionId = useSessionUiStore.getState().selectedSessionId;
    const currentModels = useUIStore.getState().models;
    const optimisticModels = currentModels.map((m) => ({ ...m, active: m.key === modelKey }));

    setModels(optimisticModels);
    if (currentSessionId) {
      setCachedModels(currentSessionId, optimisticModels);
    }

    if (!currentSessionId) {
      return;
    }

    const payload = await updateSessionModel(currentSessionId, modelKey);
    if (!payload) {
      setStreaming('error');
      setStatusMessage('Error');
      setError('Unable to update session model');
      void refreshModels(currentSessionId);
      return;
    }

    setQueryParams({ cwd: payload.cwd, sessionId: payload.id });
    void refreshModels(payload.id);
    void refreshThinkingLevels(payload.id);
    setError('');
  }, [refreshModels, refreshThinkingLevels, setError, setModels, setStatusMessage, setStreaming, updateSessionModel]);

  const handleThinkingLevelSelect = useCallback(async (thinkingLevel: ThinkingLevel): Promise<void> => {
    const currentSessionId = useSessionUiStore.getState().selectedSessionId;
    if (!currentSessionId) {
      return;
    }

    const payload = await updateSessionThinkingLevel(currentSessionId, thinkingLevel);
    if (!payload) {
      setStreaming('error');
      setStatusMessage('Error');
      const message = 'Unable to update thinking level';
      setThinkingLevelError(message);
      setError(message);
      return;
    }

    setThinkingConfig(availableThinkingLevels, payload.thinkingLevel);
    setThinkingLevelError('');
    setError('');
  }, [availableThinkingLevels, setError, setStatusMessage, setStreaming, setThinkingConfig, updateSessionThinkingLevel]);

  const handleSystemdRestart = useCallback(async (): Promise<void> => {
    setStatusMessage('Restarting service...');
    try {
      await apiRequest<{ ok: boolean }>('/api/maintenance/restart', { method: 'POST' });
      setStatusMessage('Service restarted');
      setError('');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setStatusMessage('Restart failed');
      setError(message);
    }
  }, [setError, setStatusMessage]);

  return {
    conversation,
    streaming,
    statusMessage,
    error,
    sidebarOpen,
    toggleSidebar,
    models,
    activeModelKey,
    showReasoningTraces,
    relayStatusMessage,
    relayConnected,
    availableThinkingLevels,
    activeThinkingLevel,
    thinkingLevelError,
    prompt,
    setPrompt: (value: string) => setPendingInputText(value),
    projectDirectories,
    selectedDirectory,
    selectedSessionId,
    currentSession,
    currentDirectoryLabel,
    visibleSessions,
    homeDirectory,
    currentSessionActivity,
    interactionStreaming,
    activeStreamingMessageId: streamingSession.activeMessageId ?? undefined,
    activeStreamingPhase: streamingSession.phase ?? undefined,
    handleSend,
    handleAbort,
    handleCreateSession,
    handleDeleteSession,
    handleDirectorySelect,
    handleProjectAdd,
    handleProjectRemove,
    handleSessionRename,
    handleSessionSelect,
    handleModelSelect,
    handleThinkingLevelSelect,
    systemdRestartEnabled,
    handleSystemdRestart,
  };
}
