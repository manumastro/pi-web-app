import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CircleHelp,
  Folder,
  Info,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Search,
  Settings2,
  MessageSquareText,
  SlidersHorizontal,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  Check,
  X,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DirectoryInfo, SessionInfo } from '@/types';
import { AddProjectDialog } from './AddProjectDialog';
import { SettingsDialog } from './SettingsDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PiLogo } from '@/components/brand/PiLogo';

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
  projects: DirectoryInfo[];
  sessions: SessionInfo[];
  selectedDirectory: string;
  selectedSessionId: string;
  homeDirectory: string;
  relayStatusMessage?: string;
  relayConnected?: boolean;
  sidebarOpen?: boolean;
  mobileVariant?: boolean;
  onDirectorySelect: (cwd: string) => void;
  onProjectAdd: (path: string) => boolean;
  onProjectRemove: (cwd: string) => void;
  onSessionSelect: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onSessionRename: (id: string, title: string) => void;
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

function formatProjectLabel(project: DirectoryInfo, homeDirectory: string): string {
  return project.cwd === homeDirectory ? '~' : project.label;
}

function getSessionStatusBadge(status: string): { label: string; className: string } | null {
  switch (status) {
    case 'busy':
    case 'prompting':
    case 'answering':
      return { label: 'Working', className: 'working' };
    case 'retry':
      return { label: 'Retry', className: 'retry' };
    case 'waiting_question':
      return { label: 'Question', className: 'attention' };
    case 'waiting_permission':
      return { label: 'Permission', className: 'attention' };
    case 'error':
      return { label: 'Error', className: 'error' };
    default:
      return null;
  }
}

function isSessionWorking(status: string): boolean {
  return status === 'busy'
    || status === 'prompting'
    || status === 'answering'
    || status === 'retry'
    || status === 'waiting_question'
    || status === 'waiting_permission';
}

function ProjectMenu({
  project,
  isHomeProject,
  onNewSession,
  onCloseProject,
}: {
  project: DirectoryInfo;
  isHomeProject: boolean;
  onNewSession: () => void;
  onCloseProject: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="sidebar-row-menu-trigger inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 opacity-0 group-hover:opacity-100"
          aria-label="Project menu"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuItem onClick={onNewSession}>
          <MessageSquareText className="mr-1.5 h-4 w-4" />
          New session
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCloseProject} disabled={isHomeProject} className="text-destructive focus:text-destructive">
          <X className="mr-1.5 h-4 w-4" />
          Close project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarPanel({
  projects,
  sessions,
  selectedDirectory,
  selectedSessionId,
  homeDirectory,
  relayStatusMessage = 'Relay connected',
  relayConnected = true,
  sidebarOpen = true,
  mobileVariant = false,
  onDirectorySelect,
  onProjectAdd,
  onProjectRemove,
  onSessionSelect,
  onSessionDelete,
  onSessionRename,
  onNewSession,
  onToggleSidebar,
}: SidebarPanelProps) {
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSessionSearchOpen, setIsSessionSearchOpen] = useState(false);
  const [compactSessions, setCompactSessions] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const activeProject = projects.find((project) => project.cwd === selectedDirectory) ?? projects[0] ?? null;
  const projectLabel = activeProject ? formatProjectLabel(activeProject, homeDirectory) : 'Home';
  const projectCount = activeProject?.sessionCount ?? sessions.length;

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return sessions;
    }

    return sessions.filter((session) => {
      const title = (session.title || 'Untitled Session').toLowerCase();
      return title.includes(query) || session.cwd.toLowerCase().includes(query);
    });
  }, [searchQuery, sessions]);

  useEffect(() => {
    if (isSessionSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSessionSearchOpen]);

  useEffect(() => {
    if (editingSessionId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingSessionId]);

  const startRenameSession = (session: SessionInfo) => {
    setEditingSessionId(session.id);
    setEditingSessionTitle(session.title || 'Untitled Session');
  };

  const finishRenameSession = (session: SessionInfo) => {
    const nextTitle = editingSessionTitle.trim();
    onSessionRename(session.id, nextTitle.length > 0 ? nextTitle : 'Untitled Session');
    setEditingSessionId(null);
    setEditingSessionTitle('');
  };

  return (
    <>
      <AddProjectDialog
        open={addProjectOpen}
        homeDirectory={homeDirectory}
        onOpenChange={setAddProjectOpen}
        onAddProject={onProjectAdd}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <div className={cn('sidebar-shell drawer-safe-area', mobileVariant && 'sidebar-shell-mobile')}>
        <div className="piweb-sidebar-brand-row">
          <div className="piweb-sidebar-brand">
            <PiLogo className="pi-logo-sidebar" />
            <div>
              <div className="piweb-sidebar-brand-title">Pi Web</div>
              <div className="piweb-sidebar-brand-subtitle" title={relayStatusMessage}><span className="piweb-live-dot" style={!relayConnected ? { opacity: 0.45 } : undefined} /> {relayStatusMessage}</div>
            </div>
          </div>
          {!mobileVariant ? (
            <button type="button" className="piweb-sidebar-runner-button" title="Runners">
              <Settings2 size={14} />
              <span>Runners</span>
            </button>
          ) : null}
        </div>

        <div className={cn('sidebar-toolbar', mobileVariant && 'sidebar-toolbar-mobile')}>
          {mobileVariant ? (
            <>
              <div className="sidebar-mobile-title-group">
                <div className="sidebar-mobile-eyebrow">Pi Web</div>
                <div className="sidebar-mobile-title">Sessions</div>
              </div>
              <div className="sidebar-toolbar-group">
                <SidebarIconButton
                  label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                  title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                  onClick={onToggleSidebar}
                >
                  {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
                </SidebarIconButton>
              </div>
            </>
          ) : (
            <>
              <SidebarIconButton
                label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                onClick={onToggleSidebar}
              >
                {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
              </SidebarIconButton>

              <div className="sidebar-toolbar-group">
                <SidebarIconButton label="Add project" title="Add project" onClick={() => setAddProjectOpen(true)}>
                  <Plus size={16} />
                </SidebarIconButton>
                <SidebarIconButton label="New session" title="New session" onClick={onNewSession}>
                  <MessageSquareText size={16} />
                </SidebarIconButton>
                <SidebarIconButton
                  label="Search sessions"
                  title="Search sessions"
                  onClick={() => setIsSessionSearchOpen((value) => !value)}
                >
                  <Search size={16} />
                </SidebarIconButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      aria-label="Session display mode"
                      title="Session display mode"
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[160px]">
                    <DropdownMenuItem onClick={() => setCompactSessions(false)} className="flex items-center justify-between">
                      <span>Default</span>
                      {!compactSessions ? <Check className="h-4 w-4 text-primary" /> : null}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCompactSessions(true)} className="flex items-center justify-between">
                      <span>Minimal</span>
                      {compactSessions ? <Check className="h-4 w-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>

        {mobileVariant ? (
          <div className="sidebar-mobile-actions">
            <button type="button" className="sidebar-mobile-action" onClick={onNewSession}>
              <MessageSquareText size={15} />
              <span>New session</span>
            </button>
            <button type="button" className="sidebar-mobile-action" onClick={() => setIsSessionSearchOpen((value) => !value)}>
              <Search size={15} />
              <span>Search</span>
            </button>
            <button type="button" className="sidebar-mobile-action" onClick={() => setAddProjectOpen(true)}>
              <Plus size={15} />
              <span>Add project</span>
            </button>
          </div>
        ) : null}

        {isSessionSearchOpen ? (
          <div className="px-1 pb-2">
            <div className="mb-1 flex items-center justify-between px-0.5 typography-micro text-muted-foreground/80">
              {searchQuery.trim().length > 0 ? (
                <span>{filteredSessions.length} {filteredSessions.length === 1 ? 'match' : 'matches'}</span>
              ) : (
                <span />
              )}
              <span>Esc to clear</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search sessions..."
                className="h-8 w-full rounded-md border border-border bg-transparent pl-8 pr-8 typography-ui-label text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    if (searchQuery.length > 0) {
                      setSearchQuery('');
                    } else {
                      setIsSessionSearchOpen(false);
                    }
                  }
                }}
              />
              {searchQuery.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className={cn('directory-item sidebar-project-item', 'active')}
          onClick={() => onDirectorySelect(activeProject?.cwd ?? homeDirectory)}
          title={activeProject?.cwd ?? homeDirectory}
        >
          <Folder size={14} className="flex-shrink-0" />
          <span className="truncate sidebar-project-label">{projectLabel}</span>
          <span className="sidebar-project-count">{projectCount}</span>
        </button>

        <div className="sidebar-section">
          <p className="sidebar-section-title">Projects</p>
          <div className="space-y-0.5">
            {projects.map((project) => {
              const isHomeProject = project.cwd === homeDirectory;
              return (
                <div key={project.cwd} className="group relative">
                  <button
                    type="button"
                    className={cn('directory-item w-full pr-8', project.cwd === selectedDirectory && 'active')}
                    onClick={() => onDirectorySelect(project.cwd)}
                    title={project.cwd}
                  >
                    <Folder size={14} className="flex-shrink-0" />
                    <span className="truncate">{formatProjectLabel(project, homeDirectory)}</span>
                    <span className="ml-auto text-[11px] opacity-60">{project.sessionCount}</span>
                  </button>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <ProjectMenu
                      project={project}
                      isHomeProject={isHomeProject}
                      onNewSession={onNewSession}
                      onCloseProject={() => onProjectRemove(project.cwd)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sidebar-section">
          <button
            type="button"
            className="sidebar-section-title sidebar-section-toggle"
            onClick={() => setSessionsExpanded((value) => !value)}
          >
            <span>{sessionsExpanded ? '▼' : '▶'}</span>
            <span>Sessions</span>
          </button>

          {filteredSessions.length === 0 ? (
            <p className="sidebar-note">No sessions match this project.</p>
          ) : sessionsExpanded ? (
            <div className="space-y-0.5">
              {filteredSessions.map((session) => {
                const isEditing = editingSessionId === session.id;
                const statusBadge = getSessionStatusBadge(session.status);
                return (
                  <div key={session.id} className="group relative">
                    {isEditing ? (
                      <div className="session-item active w-full pr-8">
                        <Input
                          ref={editInputRef}
                          value={editingSessionTitle}
                          onChange={(event) => setEditingSessionTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.stopPropagation();
                              setEditingSessionId(null);
                              setEditingSessionTitle('');
                              return;
                            }
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              finishRenameSession(session);
                            }
                          }}
                          className="h-6 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                        />
                        <button
                          type="button"
                          className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
                          onClick={() => finishRenameSession(session)}
                          aria-label="Save session title"
                          title="Save"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingSessionId(null);
                            setEditingSessionTitle('');
                          }}
                          aria-label="Cancel rename"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={cn(
                          'session-item w-full pr-8',
                          compactSessions && 'compact',
                          session.id === selectedSessionId && 'active',
                          session.id === selectedSessionId && isSessionWorking(session.status) && 'session-item-working',
                        )}
                        onClick={() => onSessionSelect(session.id)}
                        title={session.title || 'Untitled Session'}
                      >
                        <MessageSquareText size={14} className="flex-shrink-0" />
                        <span className="truncate flex-1 text-left">
                          {session.title || 'Untitled Session'}
                        </span>
                        {statusBadge ? (
                          <span className={cn('session-status-badge', statusBadge.className)} title={statusBadge.label}>
                            <span className="session-status-dot" />
                            {!compactSessions ? <span>{statusBadge.label}</span> : null}
                          </span>
                        ) : !compactSessions ? <span className="session-item-time">{formatSessionTime(session.updatedAt)}</span> : null}
                      </button>
                    )}

                    {!isEditing ? (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="sidebar-row-menu-trigger inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-opacity opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                              aria-label="Session menu"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[180px]">
                            <DropdownMenuItem onClick={() => startRenameSession(session)}>
                              <Pencil className="mr-1.5 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onSessionDelete(session.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-1.5 h-4 w-4" />
                              Delete session
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="sidebar-footer">
          <SidebarIconButton label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
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
    </>
  );
}

export default SidebarPanel;
