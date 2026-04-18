import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { apiGet, apiRequest } from './api';
import ConversationPanel from './components/ConversationPanel';
import ComposerPanel from './components/ComposerPanel';
import { appendPrompt, applySsePayload, messagesToConversation, type ConversationItem, type SsePayload } from './chatState';
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
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('connecting');
  const [statusMessage, setStatusMessage] = useState('Caricamento...');
  const [error, setError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

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

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    eventSourceRef.current?.close();
    setStreaming('connecting');
    setStatusMessage('Connessione SSE...');
    const source = new EventSource(`/api/events?sessionId=${encodeURIComponent(sessionId)}`);
    eventSourceRef.current = source;

    source.onopen = () => {
      setStreaming('idle');
      setStatusMessage('SSE attivo');
      setError('');
    };

    const applyPayload = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data) as SsePayload;
      if (payload.sessionId !== sessionId) {
        return;
      }
      setConversation((current) => applySsePayload(current, payload));
    };

    source.addEventListener('text_chunk', (event) => {
      applyPayload(event as MessageEvent);
      setStreaming('streaming');
    });
    source.addEventListener('thinking', (event) => applyPayload(event as MessageEvent));
    source.addEventListener('tool_call', (event) => applyPayload(event as MessageEvent));
    source.addEventListener('tool_result', (event) => applyPayload(event as MessageEvent));
    source.addEventListener('done', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as SsePayload;
      if (payload.sessionId !== sessionId) {
        return;
      }
      setStreaming('idle');
      setStatusMessage(payload.aborted ? 'Risposta interrotta' : 'Risposta completata');
      setConversation((current) => applySsePayload(current, payload));
    });
    source.addEventListener('error', (event) => {
      if (event instanceof MessageEvent && event.data) {
        const payload = JSON.parse(event.data) as SsePayload;
        if (payload.sessionId !== sessionId) {
          return;
        }
        setConversation((current) => applySsePayload(current, payload));
        setError(payload.message ?? 'Errore del motore');
        setStatusMessage('Errore dal motore');
        setStreaming('error');
        return;
      }

      setStreaming('connecting');
      setStatusMessage('Connessione persa, riconnessione in corso...');
    });

    return () => {
      source.close();
    };
  }, [sessionId]);

  async function handleSend(): Promise<void> {
    const text = prompt.trim();
    if (!text || !sessionId) {
      return;
    }

    setError('');
    setStreaming('streaming');
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
      <aside className="sidebar">
        <div className="panel">
          <h1>Pi Web</h1>
          <p className="muted">{statusMessage}</p>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="panel">
          <label>
            CWD
            <input value={cwd} onChange={(event) => setCwd(event.target.value)} onBlur={() => setQueryParams({ cwd })} />
          </label>
          <button onClick={handleCreateSession}>Nuova sessione</button>
        </div>

        <div className="panel">
          <label>
            Modello
            <select value={currentSession?.model ?? models[0]?.id ?? ''} onChange={(event) => handleModelChange(event.target.value)}>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · {model.provider}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="panel">
          <div className="panel-title">Sessioni</div>
          <div className="session-list">
            {sessions.map((session) => (
              <button
                key={session.id}
                className={session.id === sessionId ? 'session active' : 'session'}
                onClick={() => {
                  setSessionId(session.id);
                  setQueryParams({ cwd, sessionId: session.id });
                  void loadSession(session.id);
                }}
              >
                <span>{session.id}</span>
                <small>{session.model ?? 'modello predefinito'}</small>
                <span
                  className="delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteSession(session.id);
                  }}
                >
                  ✕
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="content">
        {streaming === 'connecting' ? <div className="connection-banner">Riconnessione in corso...</div> : null}
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
