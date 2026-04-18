import { useState } from 'react';
import type { DirectoryInfo, ModelInfo, SessionInfo } from '../types';

interface SidebarPanelProps {
  directories: DirectoryInfo[];
  sessions: SessionInfo[];
  selectedDirectory: string;
  selectedSessionId: string;
  models: ModelInfo[];
  modelFilter: string;
  onDirectorySelect: (cwd: string) => void;
  onSessionSelect: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onNewSession: () => void;
  onModelFilterChange: (filter: string) => void;
  onModelSelect: (modelKey: string) => void;
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'ora';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}g`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function DirectoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1.5 3.5A1 1 0 012.5 2.5h3.172a1 1 0 01.707.293L7.5 3.914l1.121-1.12A1 1 0 019.328 2.5H11.5a1 1 0 011 1v7a1 1 0 01-1 1H2.5a1 1 0 01-1-1V3.5z"
        fill="currentColor"
      />
    </svg>
  );
}


function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2 3h8M4 3V2a1 1 0 011-1h2a1 1 0 011 1v1M5 5.5v3M7 5.5v3M3 3l.667 7A1 1 0 004.66 11h2.68a1 1 0 00.993-.9L9 3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SidebarPanel({
  directories,
  sessions,
  selectedDirectory,
  selectedSessionId,
  models,
  modelFilter,
  onDirectorySelect,
  onSessionSelect,
  onSessionDelete,
  onNewSession,
  onModelFilterChange,
  onModelSelect,
}: SidebarPanelProps) {
  const [sessionsExpanded, setSessionsExpanded] = useState(true);

  const filteredModels = models.filter(
    (m) =>
      !modelFilter
      || m.label.toLowerCase().includes(modelFilter.toLowerCase())
      || m.key.toLowerCase().includes(modelFilter.toLowerCase()),
  );

  const activeModel = models.find((m) => m.active) ?? models.find((m) => m.available);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sidebar header */}
      <div className="sidebar-header">
        <span className="sidebar-header-title">Progetti</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onNewSession}
          title="Nuova sessione"
          aria-label="Nuova sessione"
        >
          <PlusIcon />
          Nuova
        </button>
      </div>

      {/* Scrollable body */}
      <div className="sidebar-body">

        {/* Directories / Projects */}
        {directories.length > 0 && (
          <div className="sidebar-section">
            <p className="sidebar-section-title">Directory</p>
            {directories.map((dir) => (
              <button
                key={dir.cwd}
                type="button"
                className={`directory-item${dir.cwd === selectedDirectory ? ' active' : ''}`}
                onClick={() => onDirectorySelect(dir.cwd)}
                title={dir.cwd}
              >
                <span className="directory-item-icon">
                  <DirectoryIcon />
                </span>
                <span className="directory-item-name">{dir.label}</span>
                <span className="directory-item-count">{dir.sessionCount}</span>
              </button>
            ))}
          </div>
        )}

        {/* Sessions for selected directory */}
        {sessions.length > 0 && (
          <div className="sidebar-section">
            <button
              type="button"
              className="sidebar-section-title"
              onClick={() => setSessionsExpanded((e) => !e)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 0.25rem',
                textAlign: 'left',
              }}
              aria-expanded={sessionsExpanded}
            >
              <span>Sessioni</span>
              <span style={{ fontSize: '0.6rem', transform: sessionsExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>
                ▶
              </span>
            </button>

            {sessionsExpanded && sessions.map((session) => (
              <div
                key={session.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <button
                  type="button"
                  className={`session-item${session.id === selectedSessionId ? ' active' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => onSessionSelect(session.id)}
                  title={session.title || session.id}
                >
                  <span className="session-item-dot" />
                  <span className="session-item-name">
                    {session.title || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Senza titolo</span>}
                  </span>
                  <span className="session-item-time">{formatSessionTime(session.updatedAt)}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSessionDelete(session.id);
                  }}
                  title="Elimina sessione"
                  aria-label="Elimina sessione"
                  style={{ color: 'var(--muted)', flexShrink: 0 }}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}

        {directories.length === 0 && sessions.length === 0 && (
          <div style={{ padding: '1rem 0.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-meta)' }}>
            Nessuna sessione.<br />Clicca "Nuova" per iniziare.
          </div>
        )}

        {/* Divider */}
        <div className="divider" style={{ margin: '0.75rem 0' }} />

        {/* Model selector */}
        <div className="sidebar-section">
          <p className="sidebar-section-title">Modello</p>

          {/* Active model display */}
          {activeModel && !modelFilter && (
            <button
              type="button"
              className="model-item active"
              style={{ marginBottom: '0.5rem' }}
              onClick={() => onModelFilterChange('')}
              title={activeModel.key}
            >
              <span className="model-item-name">{activeModel.label}</span>
              <span className="model-item-badge">attivo</span>
            </button>
          )}

          {/* Model filter */}
          <div className="sidebar-search" style={{ marginBottom: '0.5rem' }}>
            <input
              type="search"
              placeholder="Cerca modello…"
              value={modelFilter}
              onChange={(e) => onModelFilterChange(e.target.value)}
              aria-label="Filtra modelli"
            />
          </div>

          {/* Model list */}
          <div style={{ display: 'grid', gap: '0.35rem', maxHeight: '200px', overflowY: 'auto' }}>
            {filteredModels.map((model) => (
              <button
                key={model.key}
                type="button"
                className={`model-item${model.active ? ' active' : ''}`}
                onClick={() => onModelSelect(model.key)}
                title={model.key}
              >
                <span className="model-item-name">{model.label}</span>
                {!model.available && (
                  <span className="model-item-badge" style={{ opacity: 0.5 }}>offline</span>
                )}
              </button>
            ))}
          </div>

          {filteredModels.length === 0 && (
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--muted)', padding: '0.25rem 0.25rem' }}>
              Nessun modello trovato.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
