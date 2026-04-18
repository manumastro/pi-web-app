import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { DirectoryInfo, ModelInfo, SessionInfo } from '@/types';

// ─── Icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ className }: { className?: string }) {
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

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M12 2H2a1 1 0 00-1 1v6a1 1 0 001 1h1.5l2 2 2-2H12a1 1 0 001-1V3a1 1 0 00-1-1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function SidebarPanel({
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

  const availableModels = models.filter((m) => m.available);
  const filteredModels = availableModels.filter(
    (m) =>
      !modelFilter ||
      m.label.toLowerCase().includes(modelFilter.toLowerCase()) ||
      m.key.toLowerCase().includes(modelFilter.toLowerCase())
  );

  const activeModel = availableModels.find((m) => m.active) ?? availableModels[0];

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
                className={cn('directory-item', dir.cwd === selectedDirectory && 'active')}
                onClick={() => onDirectorySelect(dir.cwd)}
                title={dir.cwd}
              >
                <FolderIcon className="flex-shrink-0 opacity-60" />
                <span className="truncate">{dir.label}</span>
                <span className="ml-auto text-[11px] text-muted opacity-60">{dir.sessionCount}</span>
              </button>
            ))}
          </div>
        )}

        {/* Sessions */}
        {sessions.length > 0 && (
          <div className="sidebar-section">
            <button
              type="button"
              className="sidebar-section-title w-full flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setSessionsExpanded(!sessionsExpanded)}
            >
              <span className="text-[11px]">{sessionsExpanded ? '▼' : '▶'}</span>
              <span>Sessioni</span>
            </button>
            {sessionsExpanded && (
              <div className="space-y-0.5">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="group relative"
                  >
                    <button
                      type="button"
                      className={cn(
                        'session-item w-full pr-8',
                        session.id === selectedSessionId && 'active'
                      )}
                      onClick={() => onSessionSelect(session.id)}
                      title={session.title || session.id}
                    >
                      <ChatIcon />
                      <span className="truncate flex-1 text-left">
                        {session.title || 'Sessione senza titolo'}
                      </span>
                      <span className="session-item-time">
                        {formatSessionTime(session.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSessionDelete(session.id);
                      }}
                      aria-label="Elimina sessione"
                      title="Elimina"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Model filter */}
        <div className="sidebar-section">
          <p className="sidebar-section-title">Modello</p>
          <input
            type="text"
            className="w-full h-8 px-2.5 text-xs bg-background border border-border rounded-lg mb-2 focus:outline-none focus:border-accent"
            placeholder="Cerca modello…"
            value={modelFilter}
            onChange={(e) => onModelFilterChange(e.target.value)}
          />
          
          {/* Active model indicator */}
          {activeModel && !modelFilter && (
            <button
              type="button"
              className="w-full flex items-center gap-2 p-2 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs"
              onClick={() => {}}
            >
              <span className="truncate font-medium">{activeModel.label}</span>
              {activeModel.provider && (
                <span className="text-[10px] opacity-60">{activeModel.provider}</span>
              )}
            </button>
          )}

          {/* Model list */}
          {filteredModels.length > 0 ? (
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {filteredModels.map((model) => (
                <button
                  key={model.key}
                  type="button"
                  title={model.key}
                  className={cn(
                    'w-full flex items-center gap-2 p-2 rounded-lg text-xs text-left transition-colors',
                    model.key === activeModel?.key
                      ? 'bg-accent/10 text-accent'
                      : 'hover:bg-surface-3 text-foreground/80'
                  )}
                  onClick={() => onModelSelect(model.key)}
                >
                  <span className="truncate flex-1">{model.label}</span>
                  {model.provider && (
                    <span className="text-[10px] opacity-50">{model.provider}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 py-1 text-xs text-muted">
              {availableModels.length > 0 ? 'Nessun modello trovato' : 'Nessun modello disponibile'}
            </p>
          )}
        </div>

        {/* Empty state */}
        {directories.length === 0 && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FolderIcon className="w-8 h-8 opacity-30 mb-3" />
            <p className="text-xs text-muted">Nessun progetto</p>
            <button
              type="button"
              className="btn btn-primary btn-sm mt-3"
              onClick={onNewSession}
            >
              <PlusIcon />
              Nuova sessione
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SidebarPanel;
