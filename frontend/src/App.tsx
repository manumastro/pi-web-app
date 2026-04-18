import { useEffect, useCallback } from 'react';
import { apiGet, apiRequest } from './api';
import { appendPrompt, applySsePayload, messagesToConversation } from './chatState';
import type { SsePayload } from './chatState';
import {
  buildPermissionDecisionMessage,
  buildPermissionStatusLabel,
  buildQuestionResponseMessage,
  buildQuestionStatusLabel,
} from './interactionMessages';
import { useSessionStream } from './hooks/useSessionStream';
import type { PermissionItem, QuestionItem } from './chatState';
import type { ModelInfo, SessionInfo, StreamingState } from './types';

// Store
import { useChatStore } from './stores/chatStore';
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
import { PermissionCard } from './components/chat/PermissionCard';
import { QuestionCard } from './components/chat/QuestionCard';
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

function formatDirectoryLabel(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  return parts.at(-1) ?? (cwd === '/' ? 'root' : cwd);
}

// ─── Connection Banner ───────────────────────────────────────────────────────

function ConnectionBanner({ state, message }: { state: StreamingState; message: string }) {
  if (state === 'idle') return null;
  return (
    <div className={`connection-banner ${state === 'error' ? 'error' : ''}`}>
      {state === 'connecting' ? '⟳' : state === 'streaming' ? '◉' : '✗'} {message}
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
    appendPrompt: storeAppendPrompt,
    setStreaming,
    setStatusMessage,
    setError,
  } = useChatStore();

  const {
    sessions,
    sortedSessions,
    projectDirectories,
    currentSession,
    visibleSessions,
    selectedDirectory,
    selectedSessionId,
    setSessions,
    addSession,
    updateSession,
    deleteSession: deleteSessionFromStore,
    setSelectedDirectory,
    setSelectedSessionId,
  } = useSessionStore();

  const {
    toggleSidebar,
    models,
    setModels,
    activeModelKey,
    setActiveModel,
    prompt,
    setPrompt,
  } = useUIStore();

  // ─── Derived State ──────────────────────────────────────────────────────────
  const currentDirectory = currentSession?.cwd ?? selectedDirectory;
  const currentDirectoryLabel = formatDirectoryLabel(currentDirectory);
  const interactionItems = conversation.filter(
    (item): item is QuestionItem | PermissionItem =>
      item.kind === 'question' || item.kind === 'permission',
  );

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
    setConversation(messagesToConversation(payload.session.messages));
    setSelectedSessionId(payload.session.id);
    setSelectedDirectory(payload.session.cwd);
    setQueryParams({ cwd: payload.session.cwd, sessionId: payload.session.id });
    await refreshModels(payload.session.id);
  }, [setConversation, setSelectedSessionId, setSelectedDirectory, refreshModels]);

  const loadInitialState = useCallback(async (): Promise<void> => {
    setStatusMessage('Loading…');
    try {
      const payload = await apiGet<{ sessions: SessionInfo[] }>('/api/sessions');
      setSessions(payload.sessions);
      
      const queryCwd = getQueryParam('cwd') || selectedDirectory;
      const querySessionId = getQueryParam('sessionId') || selectedSessionId;
      
      const firstDir = projectDirectories[0];
      const firstSession = sortedSessions.find(s => s.cwd === (firstDir?.cwd ?? '/'));
      
      const targetCwd = queryCwd || firstDir?.cwd || '/';
      const targetSessionId = querySessionId || firstSession?.id;
      
      if (targetSessionId) {
        await loadSession(targetSessionId);
        setStatusMessage('Connected');
      } else {
        setSelectedDirectory(targetCwd);
        setSelectedSessionId('');
        setConversation([]);
        setQueryParams({ cwd: targetCwd, sessionId: '' });
        await refreshModels(undefined);
        setStatusMessage('Select or create a session');
      }
      setError('');
    } catch (cause) {
      setStatusMessage('Load failed');
      setError(cause instanceof Error ? cause.message : 'Unknown error');
      setStreaming('error');
    }
  }, [setSessions, setConversation, setSelectedDirectory, setSelectedSessionId, setStatusMessage, setError, setStreaming, refreshModels, loadSession, projectDirectories, sortedSessions, selectedDirectory, selectedSessionId]);

  // ─── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    void loadInitialState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSessionStream({
    sessionId: selectedSessionId || undefined,
    onPayload: (payload: SsePayload) => {
      const currentConversation = useChatStore.getState().conversation;
      const updated = applySsePayload(currentConversation, payload);
      setConversation(updated);
      if (payload.type === 'done') {
        setStreaming('idle');
        setStatusMessage(payload.aborted ? 'Stopped' : 'Connected');
      } else if (payload.type === 'error') {
        setStreaming('error');
        setStatusMessage('Error');
      }
    },
    onConnected: () => {
      const currentState = useChatStore.getState().streaming;
      setStreaming(currentState === 'error' ? 'error' : 'idle');
      setStatusMessage('Connected');
    },
    onConnectionLost: () => {
      setStreaming('connecting');
      setStatusMessage('Reconnecting…');
    },
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const submitPrompt = useCallback(async (message: string, statusLabel: string): Promise<void> => {
    const { selectedSessionId: sessionId } = useSessionStore.getState();
    const { activeModelKey: model } = useUIStore.getState();
    const cwd = useSessionStore.getState().currentSession?.cwd ?? useSessionStore.getState().selectedDirectory;
    if (!sessionId) return;
    setError('');
    setStreaming('streaming');
    setStatusMessage(statusLabel);
    storeAppendPrompt(message, model);
    setPrompt('');
    try {
      await apiRequest('/api/messages/prompt', {
        method: 'POST',
        body: JSON.stringify({ sessionId, cwd, message, model }),
      });
    } catch (cause) {
      setStreaming('error');
      setStatusMessage('Error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [setError, setStreaming, setStatusMessage, storeAppendPrompt, setPrompt]);

  const handleSend = useCallback(async (): Promise<void> => {
    const text = prompt.trim();
    if (!text) return;
    await submitPrompt(text, 'Sending…');
  }, [prompt, submitPrompt]);

  const handleAnswerQuestion = useCallback(async (question: QuestionItem, answer: string): Promise<void> => {
    await submitPrompt(
      buildQuestionResponseMessage(question, answer),
      buildQuestionStatusLabel(question),
    );
  }, [submitPrompt]);

  const handleApprovePermission = useCallback(async (permission: PermissionItem): Promise<void> => {
    await submitPrompt(
      buildPermissionDecisionMessage(permission, 'approved'),
      buildPermissionStatusLabel(permission, 'approved'),
    );
  }, [submitPrompt]);

  const handleDenyPermission = useCallback(async (permission: PermissionItem): Promise<void> => {
    await submitPrompt(
      buildPermissionDecisionMessage(permission, 'denied'),
      buildPermissionStatusLabel(permission, 'denied'),
    );
  }, [submitPrompt]);

  const handleAbort = useCallback(async (): Promise<void> => {
    const sessionId = useSessionStore.getState().selectedSessionId;
    if (!sessionId) return;
    await apiRequest('/api/messages/abort', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }, []);

  const handleCreateSession = useCallback(async (): Promise<void> => {
    const currentModels = useUIStore.getState().models;
    const currentDirectory = useSessionStore.getState().selectedDirectory;
    const defaultModel = currentModels.find((m) => m.active)?.key ?? currentModels.find((m) => m.available)?.key ?? currentModels[0]?.key ?? '';
    const created = await apiRequest<{ session: SessionInfo }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cwd: currentDirectory, model: defaultModel }),
    });
    addSession(created.session);
    setSelectedSessionId(created.session.id);
    setSelectedDirectory(created.session.cwd);
    setQueryParams({ cwd: created.session.cwd, sessionId: created.session.id });
    setConversation([]);
    setStatusMessage('Session ready');
    await refreshModels(created.session.id);
  }, [addSession, setSelectedSessionId, setSelectedDirectory, setConversation, setStatusMessage, refreshModels]);

  const handleDeleteSession = useCallback(async (targetId: string): Promise<void> => {
    const { selectedSessionId, selectedDirectory, sortedSessions } = useSessionStore.getState();
    await apiRequest(`/api/sessions/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
    deleteSessionFromStore(targetId);
    
    if (selectedSessionId === targetId) {
      const next = sortedSessions.find((s) => s.id !== targetId);
      if (next) {
        await loadSession(next.id);
      } else {
        setSelectedSessionId('');
        setConversation([]);
        setQueryParams({ cwd: selectedDirectory, sessionId: '' });
        setStatusMessage('No session');
      }
    }
  }, [deleteSessionFromStore, loadSession, setSelectedSessionId, setConversation, setStatusMessage]);

  const handleDirectorySelect = useCallback(async (nextDir: string): Promise<void> => {
    const { sortedSessions } = useSessionStore.getState();
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
  }, [setSelectedDirectory, loadSession, setSelectedSessionId, setConversation, setStatusMessage]);

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
    try {
      const payload = await apiRequest<{ session: SessionInfo }>('/api/models/session/model', {
        method: 'PUT',
        body: JSON.stringify({ sessionId: currentSessionId, modelId: modelKey }),
      });
      updateSession(payload.session.id, payload.session);
      setSelectedSessionId(payload.session.id);
      setSelectedDirectory(payload.session.cwd);
      setQueryParams({ cwd: payload.session.cwd, sessionId: payload.session.id });
      setModels(currentModels.map((m) => ({ ...m, active: m.key === modelKey })));
      setActiveModel(modelKey);
      setError('');
      await refreshModels(payload.session.id);
    } catch (cause) {
      setStreaming('error');
      setStatusMessage('Error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [setModels, setSelectedSessionId, setSelectedDirectory, setActiveModel, setError, setStreaming, setStatusMessage, updateSession, refreshModels]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  const sidebar = (
    <Sidebar
      directories={projectDirectories}
      sessions={visibleSessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={selectedSessionId}
      onDirectorySelect={handleDirectorySelect}
      onSessionSelect={handleSessionSelect}
      onSessionDelete={handleDeleteSession}
      onNewSession={handleCreateSession}
    />
  );

  const header = (
    <Header
      sessionName={currentSession?.title ?? 'Untitled Session'}
      projectLabel={currentDirectoryLabel}
      onNewSession={handleCreateSession}
      onToggleSidebar={toggleSidebar}
    />
  );

  const content = selectedSessionId ? (
    <ChatView sessionId={selectedSessionId}>
      <ConversationPanel items={conversation} error={error} />

      {interactionItems
        .filter((item): item is PermissionItem => item.kind === 'permission')
        .map((permission) => (
          <PermissionCard
            key={permission.id}
            permission={permission}
            onApprove={() => handleApprovePermission(permission)}
            onDeny={() => handleDenyPermission(permission)}
          />
        ))}

      {interactionItems
        .filter((item): item is QuestionItem => item.kind === 'question')
        .map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            onAnswer={(answer) => handleAnswerQuestion(question, answer)}
          />
        ))}

      <StatusRow state={streaming} statusMessage={statusMessage} onAbort={handleAbort} />

      <ComposerPanel
        prompt={prompt}
        streaming={streaming}
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

  return (
    <>
      <MainLayout
        sidebar={sidebar}
        header={header}
        content={content}
        connectionBanner={<ConnectionBanner state={streaming} message={statusMessage} />}
      />
      <Toaster />
    </>
  );
}
