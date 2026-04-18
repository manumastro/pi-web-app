import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiRequest } from './api';
import { appendPrompt, applySsePayload, messagesToConversation } from './chatState';
import ComposerPanel from './components/ComposerPanel';
import ConversationPanel from './components/ConversationPanel';
import QuestionPermissionPanel from './components/QuestionPermissionPanel';
import SidebarPanel from './components/SidebarPanel';
import {
  buildPermissionDecisionMessage,
  buildPermissionStatusLabel,
  buildQuestionResponseMessage,
  buildQuestionStatusLabel,
} from './interactionMessages';
import { useSessionStream } from './hooks/useSessionStream';
import type { ConversationItem, PermissionItem, QuestionItem } from './chatState';
import type { DirectoryInfo, ModelInfo, SessionInfo, StreamingState } from './types';

function getQueryParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

function setQueryParams(params: { cwd?: string; sessionId?: string }): void {
  const search = new URLSearchParams(window.location.search);
  if (params.cwd !== undefined) {
    search.set('cwd', params.cwd);
  }
  if (params.sessionId !== undefined) {
    search.set('sessionId', params.sessionId);
  }
  const nextSearch = search.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
}

function formatDirectoryLabel(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  return parts.at(-1) ?? (cwd === '/' ? 'root' : cwd);
}

function summarizeDirectories(sessions: SessionInfo[]): DirectoryInfo[] {
  const grouped = new Map<string, DirectoryInfo>();
  for (const session of sessions) {
    const current = grouped.get(session.cwd);
    if (current) {
      current.sessionCount += 1;
      if (session.updatedAt > current.updatedAt) {
        current.updatedAt = session.updatedAt;
      }
      continue;
    }
    grouped.set(session.cwd, {
      cwd: session.cwd,
      label: formatDirectoryLabel(session.cwd),
      sessionCount: 1,
      updatedAt: session.updatedAt,
    });
  }
  return Array.from(grouped.values()).sort((l, r) => r.updatedAt.localeCompare(l.updatedAt));
}

function pickInitialSelection(
  sessions: SessionInfo[],
  queryCwd: string,
  querySessionId: string,
): { cwd: string; sessionId: string } {
  if (querySessionId) {
    const found = sessions.find((s) => s.id === querySessionId);
    if (found) return { cwd: found.cwd, sessionId: found.id };
  }
  const directories = summarizeDirectories(sessions);
  if (queryCwd) {
    const found = directories.find((d) => d.cwd === queryCwd);
    if (found) {
      const first = sessions.find((s) => s.cwd === found.cwd);
      return { cwd: found.cwd, sessionId: first?.id ?? '' };
    }
  }
  if (directories[0]) {
    const first = sessions.find((s) => s.cwd === directories[0]!.cwd);
    return { cwd: directories[0]!.cwd, sessionId: first?.id ?? '' };
  }
  return { cwd: queryCwd || '/', sessionId: '' };
}

// ─── Status chip ─────────────────────────────────────────────────────────────

function StatusChip({ state, message }: { state: StreamingState; message: string }) {
  const className =
    state === 'streaming' || state === 'connecting'
      ? 'status-chip connecting'
      : state === 'error'
        ? 'status-chip error'
        : 'status-chip';

  const dots =
    state === 'streaming' || state === 'connecting' ? (
      <span className="thinking-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    ) : null;

  return (
    <span className={className} title={message}>
      {dots}
      {message}
    </span>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function AppHeader({
  sessionName,
  state,
  statusMessage,
  onToggleSidebar,
}: {
  sessionName: string;
  state: StreamingState;
  statusMessage: string;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          title="Sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>

        <span className="app-header-title">{sessionName || 'Nessuna sessione'}</span>
      </div>

      <div className="app-header-right">
        <StatusChip state={state} message={statusMessage} />
      </div>
    </header>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onNewSession }: { onNewSession: () => void }) {
  return (
    <div className="empty-state">
      <svg
        className="empty-state-icon"
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        aria-hidden
      >
        <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
        <path
          d="M20 28h16M28 20v16"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
      <p className="empty-state-title">Nessuna sessione</p>
      <p className="empty-state-subtitle">Seleziona una sessione nella sidebar o creane una nuova.</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={onNewSession}>
        Nuova sessione
      </button>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedDirectory, setSelectedDirectory] = useState(() => getQueryParam('cwd') || '/');
  const [sessionId, setSessionId] = useState<string>(() => getQueryParam('sessionId') || '');
  const [modelFilter, setModelFilter] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState<StreamingState>('idle');
  const [statusMessage, setStatusMessage] = useState('Connessione in corso…');
  const [error, setError] = useState('');

  const sortedSessions = useMemo(
    () => [...sessions].sort((l, r) => r.updatedAt.localeCompare(l.updatedAt)),
    [sessions],
  );

  const projectDirectories = useMemo(() => summarizeDirectories(sortedSessions), [sortedSessions]);
  const currentSession = sessions.find((s) => s.id === sessionId);
  const currentDirectory = currentSession?.cwd ?? selectedDirectory;

  const activeModelKey = currentSession?.model
    ?? models.find((m) => m.available)?.key
    ?? models[0]?.key
    ?? '';

  const currentDirectoryLabel = formatDirectoryLabel(currentDirectory);
  const interactionItems = useMemo(
    () => conversation.filter(
      (item): item is QuestionItem | PermissionItem =>
        item.kind === 'question' || item.kind === 'permission',
    ),
    [conversation],
  );

  const visibleSessions = useMemo(
    () =>
      sortedSessions
        .filter((s) => s.cwd === selectedDirectory)
        .sort((l, r) => r.updatedAt.localeCompare(l.updatedAt)),
    [sortedSessions, selectedDirectory],
  );

  async function loadSessions(): Promise<SessionInfo[]> {
    const payload = await apiGet<{ sessions: SessionInfo[] }>('/api/sessions');
    const next = [...payload.sessions].sort((l, r) => r.updatedAt.localeCompare(l.updatedAt));
    setSessions(next);
    return next;
  }

  async function refreshModels(selSessionId = sessionId): Promise<ModelInfo[]> {
    const url = selSessionId
      ? `/api/models?sessionId=${encodeURIComponent(selSessionId)}`
      : '/api/models';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = await apiGet<{ models: any[] }>(url);
    const mapped: ModelInfo[] = (payload.models ?? []).map((m) => ({
      key: String(m.key ?? ''),
      id: String(m.id ?? ''),
      label: String(m.name ?? m.key?.split('/').pop() ?? m.key ?? ''),
      available: Boolean(m.available),
      active: Boolean(m.isSelected),
      provider: m.provider ? String(m.provider) : undefined,
    }));
    setModels(mapped);
    return mapped;
  }

  async function loadSession(targetSessionId: string): Promise<void> {
    const payload = await apiGet<{ session: SessionInfo }>(
      `/api/sessions/${encodeURIComponent(targetSessionId)}`,
    );
    setConversation(messagesToConversation(payload.session.messages));
    setSessionId(payload.session.id);
    setSelectedDirectory(payload.session.cwd);
    setQueryParams({ cwd: payload.session.cwd, sessionId: payload.session.id });
  }

  async function loadInitialState(): Promise<void> {
    setStatusMessage('Caricamento…');
    try {
      const nextSessions = await loadSessions();
      const { cwd, sessionId: initSid } = pickInitialSelection(
        nextSessions,
        getQueryParam('cwd') || selectedDirectory,
        getQueryParam('sessionId') || sessionId,
      );
      setSelectedDirectory(cwd);
      if (initSid) {
        await loadSession(initSid);
      } else {
        setSessionId('');
        setConversation([]);
        setQueryParams({ cwd });
      }
      await refreshModels(initSid || undefined);
      setStatusMessage(initSid ? 'Connesso' : 'Seleziona o crea una sessione');
      setError('');
    } catch (cause) {
      setStatusMessage('Errore di caricamento');
      setError(cause instanceof Error ? cause.message : 'Errore sconosciuto');
      setStreaming('error');
    }
  }

  useEffect(() => {
    void loadInitialState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSessionStream({
    sessionId: sessionId || undefined,
    onPayload: (payload) => {
      setConversation((current) => applySsePayload(current, payload));
      if (payload.type === 'done') {
        setStreaming('idle');
        setStatusMessage(payload.aborted ? 'Interrotto' : 'Connesso');
      } else if (payload.type === 'error') {
        setStreaming('error');
        setStatusMessage('Errore');
      }
    },
    onConnected: () => {
      setStreaming((cur) => (cur === 'error' ? 'error' : 'idle'));
      setStatusMessage('Connesso');
    },
    onConnectionLost: () => {
      setStreaming('connecting');
      setStatusMessage('Riconnessione…');
    },
  });

  async function submitPrompt(message: string, statusLabel: string): Promise<void> {
    if (!sessionId) return;
    setError('');
    setStreaming('streaming');
    setStatusMessage(statusLabel);
    setConversation((current) => appendPrompt(current, message));
    setPrompt('');
    try {
      await apiRequest('/api/messages/prompt', {
        method: 'POST',
        body: JSON.stringify({ sessionId, cwd: currentDirectory, message, model: activeModelKey }),
      });
    } catch (cause) {
      setStreaming('error');
      setStatusMessage('Errore');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function handleSend(): Promise<void> {
    const text = prompt.trim();
    if (!text) return;
    await submitPrompt(text, 'Invio…');
  }

  async function handleAnswerQuestion(question: QuestionItem, answer: string): Promise<void> {
    await submitPrompt(
      buildQuestionResponseMessage(question, answer),
      buildQuestionStatusLabel(question),
    );
  }

  async function handleApprovePermission(permission: PermissionItem): Promise<void> {
    await submitPrompt(
      buildPermissionDecisionMessage(permission, 'approved'),
      buildPermissionStatusLabel(permission, 'approved'),
    );
  }

  async function handleDenyPermission(permission: PermissionItem): Promise<void> {
    await submitPrompt(
      buildPermissionDecisionMessage(permission, 'denied'),
      buildPermissionStatusLabel(permission, 'denied'),
    );
  }

  async function handleAbort(): Promise<void> {
    if (!sessionId) return;
    await apiRequest('/api/messages/abort', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  async function handleCreateSession(): Promise<void> {
    const defaultModel = models.find((m) => m.available)?.key ?? models[0]?.key ?? '';
    const created = await apiRequest<{ session: SessionInfo }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cwd: currentDirectory, model: defaultModel }),
    });
    const nextSessions = [created.session, ...sessions];
    setSessions(nextSessions);
    setSessionId(created.session.id);
    setSelectedDirectory(created.session.cwd);
    setQueryParams({ cwd: created.session.cwd, sessionId: created.session.id });
    setConversation([]);
    setStatusMessage('Sessione pronta');
  }

  async function handleDeleteSession(targetId: string): Promise<void> {
    await apiRequest(`/api/sessions/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
    const nextSessions = sessions.filter((s) => s.id !== targetId);
    setSessions(nextSessions);
    if (sessionId === targetId) {
      const next = nextSessions.find((s) => s.cwd === selectedDirectory) ?? nextSessions[0];
      if (next) {
        setSessionId(next.id);
        setQueryParams({ cwd: next.cwd, sessionId: next.id });
        await loadSession(next.id);
      } else {
        setSessionId('');
        setConversation([]);
        setQueryParams({ cwd: selectedDirectory });
        setStatusMessage('Nessuna sessione');
      }
    }
  }

  async function handleDirectorySelect(nextDir: string): Promise<void> {
    setSelectedDirectory(nextDir);
    setModelFilter('');
    const next = sortedSessions
      .filter((s) => s.cwd === nextDir)
      .sort((l, r) => r.updatedAt.localeCompare(l.updatedAt))[0];
    if (next) {
      await loadSession(next.id);
    } else {
      setSessionId('');
      setConversation([]);
      setQueryParams({ cwd: nextDir, sessionId: '' });
      setStatusMessage('Nessuna sessione in questa directory');
    }
  }

  async function handleSessionSelect(targetId: string): Promise<void> {
    await loadSession(targetId);
    setStatusMessage('Connesso');
  }

  async function handleModelSelect(modelKey: string): Promise<void> {
    setModelFilter('');
    setModels((current) =>
      current.map((m) => ({ ...m, active: m.key === modelKey })),
    );
  }

  const sidebarBody = (
    <SidebarPanel
      directories={projectDirectories}
      sessions={visibleSessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={sessionId}
      models={models}
      modelFilter={modelFilter}
      onDirectorySelect={handleDirectorySelect}
      onSessionSelect={handleSessionSelect}
      onSessionDelete={handleDeleteSession}
      onNewSession={handleCreateSession}
      onModelFilterChange={setModelFilter}
      onModelSelect={handleModelSelect}
    />
  );

  const chatBody = sessionId ? (
    <>
      <ConversationPanel
        items={conversation}
        error={error}
      />
      <QuestionPermissionPanel
        items={interactionItems}
        onAnswerQuestion={handleAnswerQuestion}
        onApprovePermission={handleApprovePermission}
        onDenyPermission={handleDenyPermission}
      />
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
    </>
  ) : (
    <EmptyState onNewSession={handleCreateSession} />
  );

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? '' : ' sidebar-closed'}`} aria-label="Sidebar">
        {sidebarOpen && sidebarBody}
      </aside>

      {/* Main content */}
      <main className="content">
        <AppHeader
          sessionName={currentSession?.title ?? currentDirectoryLabel ?? ''}
          state={streaming}
          statusMessage={statusMessage}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
        />
        <div className="workspace">
          <div className="chat-column">{chatBody}</div>
        </div>
      </main>
    </div>
  );
}
