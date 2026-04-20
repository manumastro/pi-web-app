import { useCallback, useEffect, useMemo } from 'react';
import { apiGet, apiRequest } from './api';
import type { SsePayload } from './chatState';
import { useSessionStream } from './hooks/useSessionStream';
import { hydrateSelectedSessionSnapshot, normalizeSelectedSessionConversation, reconcileSessionDirectories, upsertDirectorySession } from './sync/bootstrap';
import { setSyncDirectory } from './sync/sync-context';
import { reduceSessionLifecyclePayload } from './sync/event-reducer';
import { useCurrentSessionActivity } from './sync/sync-context';
import { markSessionViewed } from './sync/notification-store';
import { isRunningSessionStatus } from './sync/sessionActivity';
import { useSync } from './sync';
import { getProjectLabel, normalizeProjectPath } from './lib/path';
import type { DirectoryInfo, ModelInfo, SessionInfo, StreamingState } from './types';

// Store
import { useChatStore } from './stores/chatStore';
import { useProjectStore } from './stores/projectStore';
import { useSessionStore } from './stores/sessionStore';
import { useUIStore } from './stores/uiStore';

// Layout components
import { MainLayout } from './components/layout/MainLayout';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';

// Chat components
import { ChatView } from './components/views/ChatView';
import { ChatEmptyState } from './components/chat/ChatEmptyState';
import { ConversationPanel } from './components/chat/ConversationPanel';
import { ComposerPanel } from './components/chat/ComposerPanel';
import { StatusRow } from './components/chat/StatusRow';
import { Toaster } from './components/ui';

// ─── Query Params ─────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDirectoryLabel(cwd: string, homeDir: string): string {
  return getProjectLabel(cwd, homeDir);
}

// ─── Connection Banner ───────────────────────────────────────────────────────

function ConnectionBanner({ state, message, error }: { state: StreamingState; message: string; error?: string }) {
  if (state !== 'error') return null;
  return (
    <div className="connection-banner error">
      ✗ {error ?? message}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // ─── Store Selectors ────────────────────────────────────────────────────────
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
    currentSession,
    visibleSessions,
    selectedDirectory,
    selectedSessionId,
    setSessions,
    updateSession,
    setSelectedDirectory,
    setSelectedSessionId,
  } = useSessionStore();

  const {
    createSession,
    deleteSession: removeSession,
    updateSessionTitle,
    updateSessionModel,
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
    prompt,
    setPrompt,
    showReasoningTraces,
  } = useUIStore();

  // ─── Derived State ──────────────────────────────────────────────────────────
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
  const interactionStreaming = isRunningSessionStatus(currentSession?.status) || currentSessionActivity.isWorking
    ? 'streaming'
    : streaming;

  // ─── API Functions ──────────────────────────────────────────────────────────
  const refreshModels = useCallback(async (selSessionId?: string): Promise<ModelInfo[]> => {
    const url = selSessionId
      ? `/api/models?sessionId=${encodeURIComponent(selSessionId)}`
      : '/api/models';
    const payload = await apiGet<{ models: unknown[] }>(url);
    const mapped: ModelInfo[] = (payload.models ?? []).map((m: unknown) => {
      const model = m as Record<string, unknown>;
      return {
        key: String(model.key ?? ''),
        id: String(model.id ?? ''),
        label: String(model.name ?? model.key?.toString().split('/').pop() ?? model.key ?? ''),
        available: Boolean(model.available),
        active: Boolean(model.isSelected),
        provider: model.provider ? String(model.provider) : undefined,
      };
    });
    setModels(mapped);
    return mapped;
  }, [setModels]);

  const loadSession = useCallback(async (targetSessionId: string): Promise<void> => {
    const payload = await apiGet<{ session: SessionInfo }>(
      `/api/sessions/${encodeURIComponent(targetSessionId)}`,
    );
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
  }, [addProject, selectProject, setConversation, setSelectedSessionId, setSelectedDirectory, refreshModels]);

  const loadInitialState = useCallback(async (): Promise<void> => {
    setStatusMessage('Loading');
    try {
      const [configPayload, sessionsPayload] = await Promise.all([
        apiGet<{ homeDir: string }>('/api/config'),
        apiGet<{ sessions: SessionInfo[] }>('/api/sessions'),
      ]);

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
        await refreshModels(undefined);
        setStatusMessage('Select or create a session');
      }

      setError('');
    } catch (cause) {
      setStatusMessage('Load failed');
      setError(cause instanceof Error ? cause.message : 'Unknown error');
      setStreaming('error');
    }
  }, [addProject, hydrateProjects, loadSession, refreshModels, selectProject, setConversation, setError, setSelectedDirectory, setSelectedSessionId, setSessions, setStatusMessage, setStreaming]);

  // ─── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    void loadInitialState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSessionStream({
    sessionId: selectedSessionId || undefined,
    onPayload: (payload: SsePayload) => {
      const currentConversation = useChatStore.getState().conversation;
      reduceSessionLifecyclePayload(currentConversation, payload, {
        setConversation,
        updateSession,
        setStreaming,
        setStatusMessage,
      });
    },
    onConnected: () => {
      const currentState = useChatStore.getState().streaming;
      const sessionRunning = currentSessionActivity.isWorking;
      setStreaming(sessionRunning ? 'streaming' : (currentState === 'error' ? 'error' : 'idle'));
      setStatusMessage(sessionRunning ? 'Working' : 'Connected');
    },
    onConnectionLost: () => {
      setStreaming('connecting');
      setStatusMessage('Reconnecting');
    },
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (): Promise<void> => {
    const text = prompt.trim();
    if (!text) return;
    await sendPrompt({ message: text });
  }, [prompt, sendPrompt]);

  const handleAbort = useCallback(async (): Promise<void> => {
    const sessionId = useSessionStore.getState().selectedSessionId;
    if (!sessionId) return;
    await abortCurrentOperation(sessionId);
  }, [abortCurrentOperation]);

  const handleCreateSession = useCallback(async (): Promise<void> => {
    const currentModels = useUIStore.getState().models;
    const currentDirectory = useSessionStore.getState().selectedDirectory;
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
    await refreshModels(created.id);
  }, [addProject, createSession, selectProject, setConversation, setStatusMessage, refreshModels]);

  const handleDeleteSession = useCallback(async (targetId: string): Promise<void> => {
    const { selectedSessionId, selectedDirectory, visibleSessions } = useSessionStore.getState();
    const deleted = await removeSession(targetId);
    if (!deleted) {
      return;
    }

    if (selectedSessionId === targetId) {
      const nextVisibleSession = useSessionStore.getState().visibleSessions.find((session) => session.id !== targetId);
      if (nextVisibleSession) {
        await loadSession(nextVisibleSession.id);
      } else {
        setSelectedSessionId('');
        setConversation([]);
        setQueryParams({ cwd: selectedDirectory, sessionId: '' });
        setStatusMessage('No session');
      }
    }
  }, [loadSession, removeSession, setSelectedSessionId, setConversation, setStatusMessage]);

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

    const { sortedSessions } = useSessionStore.getState();
    setSyncDirectory(nextDir);
    setSelectedDirectory(nextDir);
    const next = sortedSessions.find((s) => s.cwd === nextDir);
    if (next) {
      await loadSession(next.id);
    } else {
      setSelectedSessionId('');
      setConversation([]);
      setQueryParams({ cwd: nextDir, sessionId: '' });
      setStatusMessage('No sessions in this directory');
    }
  }, [addProject, loadSession, selectProject, setSelectedDirectory, setSelectedSessionId, setConversation, setStatusMessage]);

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
  }, [addProject, selectProject, setSelectedDirectory, setSelectedSessionId, setConversation, setStatusMessage]);

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
    // Read current state directly to avoid stale closures
    const currentSessionId = useSessionStore.getState().selectedSessionId;
    const currentModels = useUIStore.getState().models;
    
    if (!currentSessionId) {
      setModels(currentModels.map((m) => ({ ...m, active: m.key === modelKey })));
      return;
    }

    const payload = await updateSessionModel(currentSessionId, modelKey);
    if (!payload) {
      setStreaming('error');
      setStatusMessage('Error');
      setError('Unable to update session model');
      return;
    }

    setQueryParams({ cwd: payload.cwd, sessionId: payload.id });
    await refreshModels(payload.id);
    setError('');
  }, [refreshModels, setError, setModels, setStatusMessage, setStreaming, updateSessionModel]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  const sidebar = (
    <Sidebar
      projects={projectDirectories}
      sessions={visibleSessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={selectedSessionId}
      homeDirectory={homeDirectory}
      sidebarOpen={sidebarOpen}
      onDirectorySelect={handleDirectorySelect}
      onProjectAdd={handleProjectAdd}
      onProjectRemove={handleProjectRemove}
      onSessionSelect={handleSessionSelect}
      onSessionDelete={handleDeleteSession}
      onSessionRename={handleSessionRename}
      onNewSession={handleCreateSession}
      onToggleSidebar={toggleSidebar}
    />
  );

  const header = (
    <Header
      sessionName={currentSession?.title ?? 'Untitled Session'}
      projectLabel={currentDirectoryLabel}
      sidebarOpen={sidebarOpen}
      onNewSession={handleCreateSession}
      onToggleSidebar={toggleSidebar}
    />
  );

  const content = selectedSessionId ? (
    <ChatView sessionId={selectedSessionId}>
      <ConversationPanel
        items={conversation}
        error={error}
        showReasoningTraces={showReasoningTraces}
        isWorking={interactionStreaming === 'streaming' || interactionStreaming === 'connecting'}
        workingLabel={interactionStreaming === 'connecting' ? 'Connecting...' : 'Working...'}
      />
      <StatusRow state={interactionStreaming} statusMessage={statusMessage} onAbort={handleAbort} />

      <ComposerPanel
        prompt={prompt}
        streaming={interactionStreaming}
        models={models}
        activeModelKey={activeModelKey}
        onPromptChange={setPrompt}
        onSend={handleSend}
        onAbort={handleAbort}
        onModelSelect={handleModelSelect}
      />
    </ChatView>
  ) : (
    <ChatEmptyState onNewSession={handleCreateSession} />
  );

  const connectionBanner = !selectedSessionId && streaming === 'error'
    ? <ConnectionBanner state={streaming} message={statusMessage} error={error} />
    : null;

  return (
    <>
      <MainLayout
        sidebar={sidebar}
        header={header}
        content={content}
        connectionBanner={connectionBanner}
        sidebarOpen={sidebarOpen}
      />
      <Toaster />
    </>
  );
}
