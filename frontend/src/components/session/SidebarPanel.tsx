import { useState, type ReactNode } from 'react';
import { CircleHelp, Folder, Info, PanelLeftClose, PanelLeft, Plus, Search, Settings2, MessageSquareText, SlidersHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DirectoryInfo, SessionInfo } from '@/types';

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
}

interface SidebarPanelProps {
  directories: DirectoryInfo[];
  sessions: SessionInfo[];
  selectedDirectory: string;
  selectedSessionId: string;
  sidebarOpen?: boolean;
  onDirectorySelect: (cwd: string) => void;
  onSessionSelect: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onNewSession: () => void;
  onToggleSidebar: () => void;
}

function SidebarIconButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon btn-sm"
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function SidebarPanel({
  directories,
  sessions,
  selectedDirectory,
  selectedSessionId,
  sidebarOpen = true,
  onDirectorySelect,
  onSessionSelect,
  onSessionDelete,
  onNewSession,
  onToggleSidebar,
}: SidebarPanelProps) {
  const [sessionsExpanded, setSessionsExpanded] = useState(true);

  const activeDirectory = directories.find((dir) => dir.cwd === selectedDirectory) ?? directories[0] ?? null;
  const projectLabel = activeDirectory?.label ?? 'Workspace';
  const projectCount = activeDirectory?.sessionCount ?? sessions.length;

  return (
    <div className="sidebar-shell">
      <div className="sidebar-toolbar">
        <SidebarIconButton
          label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
        </SidebarIconButton>

        <div className="sidebar-toolbar-group">
          <SidebarIconButton
            label="Add project"
            title="Add project"
            onClick={() => {
              const dirPath = prompt('Enter project path:');
              if (dirPath) {
                // Placeholder: would need backend API to add project
                alert(`Adding project: ${dirPath}`);
              }
            }}
          >
            <Plus size={16} />
          </SidebarIconButton>
          <SidebarIconButton label="New session" title="New session" onClick={onNewSession}>
            <MessageSquareText size={16} />
          </SidebarIconButton>
          <SidebarIconButton
            label="Search sessions"
            title="Search sessions"
            onClick={() => {
              const query = prompt('Search sessions:');
              if (query) {
                // Placeholder: would need to filter sessions by query
                alert(`Searching sessions: ${query}`);
              }
            }}
          >
            <Search size={16} />
          </SidebarIconButton>
          <SidebarIconButton
            label="Session display mode"
            title="Session display mode"
            onClick={() => {
              // Placeholder: toggle between list/grid view
              alert('Display mode toggle');
            }}
          >
            <SlidersHorizontal size={16} />
          </SidebarIconButton>
        </div>
      </div>

      <button
        type="button"
        className={cn('directory-item sidebar-project-item', 'active')}
        onClick={() => onDirectorySelect(activeDirectory?.cwd ?? selectedDirectory)}
        title={activeDirectory?.cwd ?? selectedDirectory}
      >
        <Folder size={14} className="flex-shrink-0" />
        <span className="truncate sidebar-project-label">{projectLabel}</span>
        <span className="sidebar-project-count">{projectCount}</span>
      </button>

      {directories.length > 1 && (
        <div className="sidebar-section">
          <p className="sidebar-section-title">Projects</p>
          <div className="space-y-0.5">
            {directories.map((dir) => (
              <button
                key={dir.cwd}
                type="button"
                className={cn('directory-item', dir.cwd === selectedDirectory && 'active')}
                onClick={() => onDirectorySelect(dir.cwd)}
                title={dir.cwd}
              >
                <Folder size={14} className="flex-shrink-0" />
                <span className="truncate">{dir.label}</span>
                <span className="ml-auto text-[11px] opacity-60">{dir.sessionCount}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <button
          type="button"
          className="sidebar-section-title sidebar-section-toggle"
          onClick={() => setSessionsExpanded((value) => !value)}
        >
          <span>{sessionsExpanded ? '▼' : '▶'}</span>
          <span>Sessions</span>
        </button>

        {sessions.length === 0 ? (
          <p className="sidebar-note">No sessions in this workspace yet.</p>
        ) : sessionsExpanded ? (
          <div className="space-y-0.5">
            {sessions.map((session) => (
              <div key={session.id} className="group relative">
                <button
                  type="button"
                  className={cn('session-item w-full pr-8', session.id === selectedSessionId && 'active')}
                  onClick={() => onSessionSelect(session.id)}
                  title={session.title || 'Untitled Session'}
                >
                  <MessageSquareText size={14} className="flex-shrink-0" />
                  <span className="truncate flex-1 text-left">
                    {session.title || 'Untitled Session'}
                  </span>
                  <span className="session-item-time">{formatSessionTime(session.updatedAt)}</span>
                </button>

                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSessionDelete(session.id);
                  }}
                  aria-label="Delete session"
                  title="Delete session"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sidebar-footer">
        <SidebarIconButton
          label="Settings"
          title="Settings"
          onClick={() => {
            alert('Settings panel coming soon');
          }}
        >
          <Settings2 size={16} />
        </SidebarIconButton>
        <SidebarIconButton
          label="Help"
          title="Help"
          onClick={() => {
            alert('Help panel coming soon');
          }}
        >
          <CircleHelp size={16} />
        </SidebarIconButton>
        <SidebarIconButton
          label="About"
          title="About"
          onClick={() => {
            alert('About Pi Web App - OpenChamber-style AI coding assistant');
          }}
        >
          <Info size={16} />
        </SidebarIconButton>
      </div>
    </div>
  );
}

export default SidebarPanel;
