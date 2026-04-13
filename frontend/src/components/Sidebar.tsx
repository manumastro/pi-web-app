import type { SessionInfo, CwdInfo } from '../types';

interface SidebarProps {
  collapsed: boolean;
  cwds: CwdInfo[];
  sessions: SessionInfo[];
  selectedCwd: string;
  activeSessionId: string | null;
  connected: boolean;
  onSelectCwd: (cwd: string) => void;
  onSelectSession: (session: SessionInfo) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onToggle: () => void;
}

export function Sidebar({
  collapsed,
  cwds,
  sessions,
  selectedCwd,
  activeSessionId,
  connected,
  onSelectCwd,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onToggle,
}: SidebarProps) {
  const totalSessions = cwds.reduce((s, c) => s + c.sessionCount, 0);

  return (
    <>
      {/* Overlay for mobile */}
      {!collapsed && (
        <div className="fixed inset-0 bg-black/60 z-[150] md:hidden" onClick={onToggle} />
      )}

      <aside
        className={`
          w-[300px] min-w-[300px] bg-[var(--color-surface)] border-r border-[var(--color-border)]
          flex flex-col h-full z-[200] transition-transform duration-200 ease-in-out
          fixed md:relative
          ${collapsed ? '-translate-x-full md:translate-x-0 md:ml-[-300px] md:opacity-0 md:pointer-events-none' : ''}
        `}
      >
        {/* Header */}
        <div className="px-3.5 py-3 border-b border-[var(--color-border)] flex items-center gap-2 h-12 flex-shrink-0">
          <span className="text-lg">🥧</span>
          <span className="font-semibold text-sm flex-1">Pi Web</span>
          <div className={`w-2 h-2 rounded-full transition-colors ${connected ? 'bg-[var(--color-green)]' : 'bg-[var(--color-red)]'}`} />
        </div>

        {/* CWD Selector */}
        {cwds.length > 0 && (
          <div className="px-2.5 py-2 border-b border-[var(--color-border)] flex-shrink-0">
            <label className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">
              Working Directory
            </label>
            <select
              value={selectedCwd}
              onChange={e => onSelectCwd(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-[var(--color-text)] px-2 py-1.5 text-xs font-mono outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">{`All directories (${totalSessions} sessions)`}</option>
              {cwds.map(c => (
                <option key={c.path} value={c.path}>{`${c.label} (${c.sessionCount})`}</option>
              ))}
            </select>
          </div>
        )}

        {/* Session List Header */}
        <div className="flex items-center justify-between px-2.5 py-2 border-b border-[var(--color-border)] flex-shrink-0">
          <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
            {sessions.length} sessions
          </span>
          <button
            onClick={onNewSession}
            className="bg-[var(--color-accent)] text-white px-2.5 py-0.5 rounded text-[11px] font-semibold hover:opacity-85"
          >
            + New
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto py-1">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`group px-3 py-2 cursor-pointer border-l-[3px] border-transparent transition-colors relative
                ${s.id === activeSessionId
                  ? 'bg-[var(--color-surface-3)] border-l-[var(--color-accent)]'
                  : 'hover:bg-[var(--color-surface-2)]'
                }`}
              onClick={() => onSelectSession(s)}
            >
              <div className="text-[13px] font-medium truncate">
                {s.name || `Session ${s.id.substring(0, 8)}`}
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] flex justify-between mt-0.5">
                <span>{s.messageCount} msgs</span>
                <span>
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString('it-IT', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                  }) : ''}
                </span>
              </div>
              <div className="text-[10px] text-[var(--color-text-dim)] font-mono mt-0.5 truncate">
                {s.cwdLabel}
              </div>
              {/* Delete button - position below the session name */}
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                className="absolute right-2 top-2 p-1 rounded opacity-0 group-hover:opacity-60 hover:opacity-100 hover:bg-[var(--color-red)]/20 text-[var(--color-red)] transition-opacity"
                title="Delete session"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
