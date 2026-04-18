import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { apiGet, apiRequest } from './api';
import type { ModelInfo, SessionInfo, SessionMessage, StreamingState } from './types';

interface SsePayload {
  type: string;
  sessionId: string;
  messageId?: string;
  content?: string;
  aborted?: boolean;
}

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
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState<StreamingState>('connecting');
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
      body: JSON.stringify({ cwd: nextCwd, model: models[0]?.id }),
    });
    return created.session.id;
  }

  async function loadSession(nextSessionId: string): Promise<void> {
    const payload = await apiGet<{ session: SessionInfo }>(`/api/sessions/${encodeURIComponent(nextSessionId)}`);
    setMessages(payload.session.messages);
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
    const source = new EventSource(`/api/events?sessionId=${encodeURIComponent(sessionId)}`);
    eventSourceRef.current = source;

    source.onopen = () => {
      setStreaming('idle');
      setStatusMessage('SSE attivo');
      setError('');
    };

    source.onerror = () => {
      setStreaming('error');
      setStatusMessage('Connessione persa');
    };

    source.addEventListener('text_chunk', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as SsePayload;
      if (payload.sessionId !== sessionId || !payload.content) {
        return;
      }
      const chunk = payload.content;
      setStreaming('streaming');
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.timestamp === 'streaming') {
          next[next.length - 1] = {
            ...last,
            content: `${last.content}${chunk}`,
          };
          return next;
        }
        next.push({
          id: payload.messageId ?? crypto.randomUUID(),
          role: 'assistant',
          content: chunk,
          timestamp: 'streaming',
        });
        return next;
      });
    });

    source.addEventListener('done', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as SsePayload;
      if (payload.sessionId !== sessionId) {
        return;
      }
      setStreaming('idle');
      setStatusMessage(payload.aborted ? 'Risposta interrotta' : 'Risposta completata');
      setMessages((current) =>
        current.map((message, index) => {
          if (index !== current.length - 1 || message.role !== 'assistant' || message.timestamp !== 'streaming') {
            return message;
          }
          return {
            ...message,
            timestamp: new Date().toISOString(),
          };
        }),
      );
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
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: 'streaming',
      },
    ]);
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
    setMessages([]);
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
      setMessages([]);
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
                <span className="delete" onClick={(event) => { event.stopPropagation(); void handleDeleteSession(session.id); }}>
                  ✕
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="content">
        <section className="panel messages-panel">
          <div className="panel-title">Messaggi</div>
          <div className="messages">
            {messages.length === 0 ? <p className="muted">Nessun messaggio ancora.</p> : null}
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <header>
                  <strong>{message.role}</strong>
                  <span>{message.timestamp === 'streaming' ? 'in streaming' : new Date(message.timestamp).toLocaleString()}</span>
                </header>
                <pre>{message.content || '...'}</pre>
              </article>
            ))}
          </div>
        </section>

        <section className="panel composer">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Scrivi un prompt..."
            rows={4}
            disabled={streaming === 'streaming'}
          />
          <div className="actions">
            <button onClick={handleSend} disabled={streaming === 'streaming' || prompt.trim().length === 0}>
              Invia
            </button>
            <button onClick={handleAbort} disabled={streaming !== 'streaming'}>
              Stop
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
