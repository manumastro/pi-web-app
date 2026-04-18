import { useEffect, useMemo, useState } from 'react';
import './styles.css';
import { apiGet, apiRequest } from './api';
import ConversationPanel from './components/ConversationPanel';
import ComposerPanel from './components/ComposerPanel';
import ConnectionStatusBanner from './components/ConnectionStatusBanner';
import SidebarPanel from './components/SidebarPanel';
import { appendPrompt, applySsePayload, messagesToConversation, type ConversationItem } from './chatState';
import { useSessionStream } from './hooks/useSessionStream';
import type { ModelInfo, SessionInfo } from './types';

function getQueryParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

function setQueryParams(params: { cwd?: string; sessionId?: string }): void {
  const search = new URLSearchParams(window.location.search);
  if (params.cwd !== undefined) {
    search.set('cwd', params.cwd);
  }
  if (params.sessionId !== undefined) {
    search.set('session', params.sessionId);
  }
  const next = `${window.location.pathname}?${search.toString()}`;
  window.history.replaceState({}, '', next);
}

export default function App() {
  const [cwd, setCwd] = useState(() => getQueryParam('cwd') || '/');
  const [sessionId, setSessionId] = useState(() => getQueryParam('session'));
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionFilter, setSessionFilter] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('connecting');
  const [statusMessage, setStatusMessage] = useState('Caricamento...');
  const [error, setError] = useState('');

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === sessionId),
    [sessions, sessionId],
  );

  async function refreshSessions(nextCwd = cwd): Promise<void> {
    const payload = await apiGet<{ sessions: SessionInfo[] }>(`/api/sessions?cwd=${encodeURIComponent(nextCwd)}`);
    setSessions(payload.sessions);
  }

  async function refreshModels(): Promise<void> {
    const payload = await apiGet<{ models: ModelInfo[] }>('/api/models');
    setModels(payload.models);
  }

  async function ensureSession(nextCwd = cwd): Promise<string> {
    const { sessions: currentSessions } = await apiGet<{ sessions: SessionInfo[] }>(
      `/api/sessions?cwd=${encodeURIComponent(nextCwd)}`,
    );
    const firstSession = currentSessions[0];
    if (firstSession) {
      return firstSession.id;
    }

    const created = await apiRequest<{ session: SessionInfo }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cwd: nextCwd, model: models[0]?.id ?? '' }),
    });
    return created.session.id;
  }

  async function loadSession(nextSessionId: string): Promise<void> {
    const payload = await apiGet<{ session: SessionInfo }>(`/api/sessions/${encodeURIComponent(nextSessionId)}`);
    setConversation(messagesToConversation(payload.session.messages));
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setStatusMessage('Caricamento...');
        await refreshModels();
        await refreshSessions(cwd);

        const nextSessionId = sessionId || (await ensureSession(cwd));
        if (!alive) {
          return;
        }

        setSessionId(nextSessionId);
        setQueryParams({ cwd, sessionId: nextSessionId });
        await loadSession(nextSessionId);
        setStatusMessage('Connesso');
        setStreaming('idle');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Errore sconosciuto');
        setStreaming('error');
        setStatusMessage('Errore di inizializzazione');
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSessionStream({
    sessionId,
    onPayload: (payload) => {
      setConversation((current) => applySsePayload(current, payload));
      if (payload.type === 'text_chunk') {
        setStreaming('streaming');
        return;
      }
      if (payload.type === 'done') {
        setStreaming('idle');
        setStatusMessage(payload.aborted ? 'Risposta interrotta' : 'Risposta completata');
        return;
      }
      if (payload.type === 'error') {
        setError(payload.message ?? 'Errore del motore');
        setStatusMessage('Errore dal motore');
        setStreaming('error');
      }
    },
    onConnected: () => {
      setStreaming('idle');
      setStatusMessage('SSE attivo');
      setError('');
    },
    onConnectionLost: () => {
      setStreaming('connecting');
      setStatusMessage('Connessione persa, riconnessione in corso...');
    },
  });

  async function handleSend(): Promise<void> {
    const text = prompt.trim();
    if (!text || !sessionId) {
      return;
    }

    setError('');
    setStreaming('streaming');
    setStatusMessage('Invio prompt...');
    setConversation((current) => appendPrompt(current, text));
    setPrompt('');

    try {
      await apiRequest('/api/messages/prompt', {
        method: 'POST',
        body: JSON.stringify({ sessionId, cwd, message: text, model: currentSession?.model ?? models[0]?.id ?? '' }),
      });
    } catch (cause) {
      setStreaming('error');
      setStatusMessage('Errore durante l’invio');
      setError(cause instanceof Error ? cause.message : 'Errore sconosciuto');
    }
  }

  async function handleSteer(): Promise<void> {
    const text = prompt.trim();
    if (!text || !sessionId) {
      return;
    }

    setError('');
    setPrompt('');
    setStatusMessage('Invio steer...');

    try {
      await apiRequest('/api/messages/steer', {
        method: 'POST',
        body: JSON.stringify({ sessionId, cwd, message: text, model: currentSession?.model ?? models[0]?.id ?? '' }),
      });
    } catch (cause) {
      setStreaming('error');
      setStatusMessage('Errore steering');
      setError(cause instanceof Error ? cause.message : 'Errore sconosciuto');
    }
  }

  async function handleFollowUp(): Promise<void> {
    const text = prompt.trim();
    if (!text || !sessionId) {
      return;
    }

    setError('');
    setPrompt('');
    setStatusMessage('Invio follow-up...');

    try {
      await apiRequest('/api/messages/follow-up', {
        method: 'POST',
        body: JSON.stringify({ sessionId, cwd, message: text, model: currentSession?.model ?? models[0]?.id ?? '' }),
      });
    } catch (cause) {
      setStreaming('error');
      setStatusMessage('Errore follow-up');
      setError(cause instanceof Error ? cause.message : 'Errore sconosciuto');
    }
  }

  async function handleAbort(): Promise<void> {
    if (!sessionId) {
      return;
    }
    await apiRequest('/api/messages/abort', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  async function handleCreateSession(): Promise<void> {
    const created = await apiRequest<{ session: SessionInfo }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cwd, model: models[0]?.id ?? '' }),
    });
    setSessions((current) => [created.session, ...current]);
    setSessionId(created.session.id);
    setQueryParams({ cwd, sessionId: created.session.id });
    setConversation([]);
  }

  async function handleDeleteSession(targetSessionId: string): Promise<void> {
    await apiRequest(`/api/sessions/${encodeURIComponent(targetSessionId)}`, {
      method: 'DELETE',
    });
    const nextSessions = sessions.filter((session) => session.id !== targetSessionId);
    setSessions(nextSessions);
    if (sessionId === targetSessionId) {
      const nextSession = nextSessions[0];
      setSessionId(nextSession?.id ?? '');
      setConversation([]);
      if (nextSession) {
        setQueryParams({ cwd, sessionId: nextSession.id });
        await loadSession(nextSession.id);
      }
    }
  }

  async function handleModelChange(nextModelId: string): Promise<void> {
    if (!sessionId) {
      return;
    }
    await apiRequest('/api/models/session/model', {
      method: 'PUT',
      body: JSON.stringify({ sessionId, modelId: nextModelId }),
    });
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, model: nextModelId } : session)));
  }

  return (
    <div className="app-shell">
      <SidebarPanel
        cwd={cwd}
        setCwd={setCwd}
        sessionFilter={sessionFilter}
        setSessionFilter={setSessionFilter}
        statusMessage={statusMessage}
        error={error}
        sessions={sessions}
        sessionId={sessionId}
        models={models}
        currentModelId={currentSession?.model ?? models[0]?.id ?? ''}
        onCwdCommit={() => setQueryParams({ cwd })}
        onCreateSession={handleCreateSession}
        onModelChange={handleModelChange}
        onSelectSession={async (selectedSessionId) => {
          setSessionId(selectedSessionId);
          setQueryParams({ cwd, sessionId: selectedSessionId });
          await loadSession(selectedSessionId);
        }}
        onDeleteSession={handleDeleteSession}
      />

      <main className="content">
        <ConnectionStatusBanner streaming={streaming} statusMessage={statusMessage} error={error} />
        <ConversationPanel conversation={conversation} />
        <ComposerPanel
          prompt={prompt}
          setPrompt={setPrompt}
          streaming={streaming}
          onSend={handleSend}
          onSteer={handleSteer}
          onFollowUp={handleFollowUp}
          onAbort={handleAbort}
        />
      </main>
    </div>
  );
}
