import type { ModelInfo, SessionInfo } from '../types';

interface SidebarPanelProps {
  cwd: string;
  setCwd: (value: string) => void;
  sessionFilter: string;
  setSessionFilter: (value: string) => void;
  statusMessage: string;
  error: string;
  sessions: SessionInfo[];
  sessionId: string;
  models: ModelInfo[];
  currentModelId: string;
  onCwdCommit: () => void;
  onCreateSession: () => void | Promise<void>;
  onModelChange: (modelId: string) => void | Promise<void>;
  onSelectSession: (sessionId: string) => void | Promise<void>;
  onDeleteSession: (sessionId: string) => void | Promise<void>;
}

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleTimeString();
}

export default function SidebarPanel({
  cwd,
  setCwd,
  sessionFilter,
  setSessionFilter,
  statusMessage,
  error,
  sessions,
  sessionId,
  models,
  currentModelId,
  onCwdCommit,
  onCreateSession,
  onModelChange,
  onSelectSession,
  onDeleteSession,
}: SidebarPanelProps) {
  const normalizedFilter = sessionFilter.trim().toLowerCase();
  const visibleSessions = normalizedFilter
    ? sessions.filter((session) => {
        const haystack = [session.id, session.cwd, session.model ?? ''].join(' ').toLowerCase();
        return haystack.includes(normalizedFilter);
      })
    : sessions;

  return (
    <aside className="sidebar">
      <div className="panel">
        <h1>Pi Web</h1>
        <p className="muted">{statusMessage}</p>
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="panel">
        <label>
          CWD
          <input value={cwd} onChange={(event) => setCwd(event.target.value)} onBlur={onCwdCommit} />
        </label>
        <button onClick={() => void onCreateSession()}>Nuova sessione</button>
      </div>

      <div className="panel">
        <label>
          Modello
          <select value={currentModelId} onChange={(event) => void onModelChange(event.target.value)}>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} · {model.provider}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="panel">
        <label>
          Cerca sessioni
          <input
            aria-label="Cerca sessioni"
            value={sessionFilter}
            onChange={(event) => setSessionFilter(event.target.value)}
            placeholder="id, cwd, modello"
          />
        </label>
        <div className="panel-title session-count">
          Sessioni <span>{visibleSessions.length}/{sessions.length}</span>
        </div>
        <div className="session-list">
          {visibleSessions.length === 0 ? <p className="muted">Nessuna sessione corrisponde al filtro.</p> : null}
          {visibleSessions.map((session) => {
            const isActive = session.id === sessionId;
            return (
              <div key={session.id} className={isActive ? 'session active' : 'session'}>
                <button
                  type="button"
                  className="session-select"
                  onClick={() => void onSelectSession(session.id)}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`Sessione ${session.id}`}
                >
                  <span>{session.id}</span>
                  <small>{session.model ?? 'modello predefinito'}</small>
                  <small>{formatUpdatedAt(session.updatedAt)}</small>
                </button>
                <button
                  type="button"
                  className="session-delete"
                  onClick={() => void onDeleteSession(session.id)}
                  aria-label={`Elimina sessione ${session.id}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
