import { useEffect, useMemo, useRef, useState } from 'react';
import { Folder, MessageSquareText, Plus, Search, Sparkles } from 'lucide-react';
import type { DirectoryInfo, ModelInfo, SessionInfo } from '@/types';
import { cn, getModifierLabel } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: SessionInfo[];
  projects: DirectoryInfo[];
  models: ModelInfo[];
  selectedSessionId: string;
  selectedDirectory: string;
  onNewSession: () => void | Promise<void>;
  onSessionSelect: (sessionId: string) => void | Promise<void>;
  onDirectorySelect: (cwd: string) => void | Promise<void>;
  onModelSelect: (modelKey: string) => void | Promise<void>;
}

type CommandKind = 'action' | 'session' | 'project' | 'model';

interface CommandItem {
  id: string;
  kind: CommandKind;
  title: string;
  subtitle?: string;
  keywords: string;
  active?: boolean;
  run: () => void | Promise<void>;
}

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function iconForKind(kind: CommandKind) {
  switch (kind) {
    case 'action': return Plus;
    case 'session': return MessageSquareText;
    case 'project': return Folder;
    case 'model': return Sparkles;
  }
}

function kindLabel(kind: CommandKind): string {
  switch (kind) {
    case 'action': return 'Action';
    case 'session': return 'Session';
    case 'project': return 'Project';
    case 'model': return 'Model';
  }
}

export function CommandPalette({
  open,
  onOpenChange,
  sessions,
  projects,
  models,
  selectedSessionId,
  selectedDirectory,
  onNewSession,
  onSessionSelect,
  onDirectorySelect,
  onModelSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => {
    const actionCommands: CommandItem[] = [
      {
        id: 'action:new-session',
        kind: 'action',
        title: 'New session',
        subtitle: 'Start a new agent session in the current project',
        keywords: 'new session create chat',
        run: onNewSession,
      },
    ];

    const sessionCommands = sessions.map<CommandItem>((session) => ({
      id: `session:${session.id}`,
      kind: 'session',
      title: session.title || 'Untitled Session',
      subtitle: `${session.cwd} · ${session.status} · ${formatSessionTime(session.updatedAt)}`,
      keywords: `${session.title ?? ''} ${session.cwd} ${session.status} ${session.model ?? ''}`,
      active: session.id === selectedSessionId,
      run: () => onSessionSelect(session.id),
    }));

    const projectCommands = projects.map<CommandItem>((project) => ({
      id: `project:${project.cwd}`,
      kind: 'project',
      title: project.label,
      subtitle: `${project.cwd} · ${project.sessionCount} sessions`,
      keywords: `${project.label} ${project.cwd}`,
      active: project.cwd === selectedDirectory,
      run: () => onDirectorySelect(project.cwd),
    }));

    const modelCommands = models.map<CommandItem>((model) => ({
      id: `model:${model.key}`,
      kind: 'model',
      title: model.label || model.key,
      subtitle: `${model.provider ?? 'provider'} · ${model.reasoning ? 'reasoning' : 'standard'}${model.available ? '' : ' · unavailable'}`,
      keywords: `${model.key} ${model.label} ${model.provider ?? ''} ${model.reasoning ? 'reasoning' : ''}`,
      active: model.active,
      run: () => onModelSelect(model.key),
    }));

    return [...actionCommands, ...sessionCommands, ...projectCommands, ...modelCommands];
  }, [models, onDirectorySelect, onModelSelect, onNewSession, onSessionSelect, projects, selectedDirectory, selectedSessionId, sessions]);

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return commands.slice(0, 30);
    const terms = normalizedQuery.split(/\s+/u).filter(Boolean);
    return commands
      .filter((command) => {
        const haystack = `${command.title} ${command.subtitle ?? ''} ${command.keywords}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 50);
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex((value) => Math.min(value, Math.max(0, filteredCommands.length - 1)));
  }, [filteredCommands.length]);

  const runCommand = async (command: CommandItem | undefined): Promise<void> => {
    if (!command) return;
    onOpenChange(false);
    await command.run();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="command-palette-dialog" aria-label="Command palette">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search sessions, projects, models, and actions.</DialogDescription>
        </DialogHeader>
        <div className="command-palette-search">
          <Search className="command-palette-search-icon" size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((value) => Math.min(value + 1, Math.max(0, filteredCommands.length - 1)));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((value) => Math.max(0, value - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                void runCommand(filteredCommands[activeIndex]);
              }
            }}
            placeholder="Search sessions, projects, models, actions…"
            className="command-palette-input"
            aria-label="Search commands"
          />
          <kbd className="command-palette-shortcut">{getModifierLabel()}K</kbd>
        </div>

        <div className="command-palette-list" role="listbox" aria-label="Commands">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">No commands match “{query}”.</div>
          ) : filteredCommands.map((command, index) => {
            const Icon = iconForKind(command.kind);
            return (
              <button
                key={command.id}
                type="button"
                className={cn('command-palette-item', index === activeIndex && 'active')}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void runCommand(command)}
                role="option"
                aria-selected={index === activeIndex}
              >
                <span className="command-palette-item-icon"><Icon size={16} /></span>
                <span className="command-palette-item-main">
                  <span className="command-palette-item-title">{command.title}</span>
                  {command.subtitle ? <span className="command-palette-item-subtitle">{command.subtitle}</span> : null}
                </span>
                {command.active ? <span className="command-palette-active-badge">Active</span> : null}
                <span className="command-palette-kind">{kindLabel(command.kind)}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CommandPalette;
