import { useCallback, useEffect, useMemo, useState } from 'react';
import { Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { apiGet } from '@/api';
import { cn } from '@/lib/utils';

export interface DirectoryEntry {
  path: string;
  name: string;
}

interface DirectoryListResponse {
  path: string;
  directories: DirectoryEntry[];
}

interface DirectoryTreeProps {
  homeDirectory: string;
  currentPath: string;
  showHidden: boolean;
  onSelectPath: (path: string) => void;
  onDoubleClickPath: (path: string) => void;
}

function formatDirectoryLabel(path: string, homeDirectory: string): string {
  const normalizedHome = homeDirectory.replace(/\/+$/, '');
  const normalizedPath = path.replace(/\/+$/, '');

  if (normalizedPath === normalizedHome) {
    return '~';
  }

  if (normalizedPath.startsWith(`${normalizedHome}/`)) {
    return `~${normalizedPath.slice(normalizedHome.length)}`;
  }

  return normalizedPath.split('/').filter(Boolean).at(-1) ?? normalizedPath;
}

function DirectoryRow({
  path,
  label,
  depth,
  selected,
  expanded,
  hasChildren,
  isLoading,
  onToggle,
  onSelect,
  onDoubleClick,
}: {
  path: string;
  label: string;
  depth: number;
  selected: boolean;
  expanded: boolean;
  hasChildren: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors',
        selected ? 'border-accent/15 bg-accent/10 text-foreground' : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
      )}
      style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
      onDoubleClick={onDoubleClick}
    >
      <button
        type="button"
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground',
          !hasChildren && !isLoading && 'opacity-35',
        )}
        onClick={onToggle}
        aria-label={expanded ? 'Collapse directory' : 'Expand directory'}
      >
        {isLoading ? (
          <span className="h-2 w-2 rounded-full bg-current animate-pulse" aria-hidden />
        ) : expanded ? (
          <ChevronDown size={13} />
        ) : (
          <ChevronRight size={13} />
        )}
      </button>

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onSelect}
        title={path}
      >
        <Folder size={14} className="flex-shrink-0" />
        <span className="truncate">{label}</span>
      </button>
    </div>
  );
}

export function DirectoryTree({ homeDirectory, currentPath, showHidden, onSelectPath, onDoubleClickPath }: DirectoryTreeProps) {
  const rootPath = useMemo(() => homeDirectory.replace(/\/+$/, ''), [homeDirectory]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set([rootPath]));
  const [childrenByPath, setChildrenByPath] = useState<Record<string, DirectoryEntry[]>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});

  const loadChildren = useCallback(async (path: string) => {
    if (childrenByPath[path] || loadingPaths[path]) {
      return;
    }

    setLoadingPaths((state) => ({ ...state, [path]: true }));
    try {
      const payload = await apiGet<DirectoryListResponse>(
        `/api/directories?path=${encodeURIComponent(path)}&hidden=${showHidden ? '1' : '0'}`,
      );
      setChildrenByPath((state) => ({
        ...state,
        [path]: payload.directories ?? [],
      }));
    } catch {
      setChildrenByPath((state) => ({ ...state, [path]: [] }));
    } finally {
      setLoadingPaths((state) => ({ ...state, [path]: false }));
    }
  }, [childrenByPath, loadingPaths, showHidden]);

  useEffect(() => {
    setExpandedPaths(new Set([rootPath]));
    setChildrenByPath({});
    setLoadingPaths({});
  }, [rootPath, showHidden]);

  useEffect(() => {
    void loadChildren(rootPath);
  }, [loadChildren, rootPath]);

  const togglePath = useCallback(async (path: string) => {
    const isExpanded = expandedPaths.has(path);
    if (!isExpanded) {
      await loadChildren(path);
    }

    setExpandedPaths((state) => {
      const next = new Set(state);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, [expandedPaths, loadChildren]);

  const renderNode = (path: string, depth: number): React.ReactNode => {
    const directories = childrenByPath[path] ?? [];
    const isLoading = Boolean(loadingPaths[path]);
    const hasChildren = true;
    const expanded = expandedPaths.has(path);
    const label = formatDirectoryLabel(path, homeDirectory);
    const selected = currentPath === path;

    return (
      <div key={path} className="space-y-0.5">
        <DirectoryRow
          path={path}
          label={label}
          depth={depth}
          selected={selected}
          expanded={expanded}
          hasChildren={hasChildren}
          isLoading={isLoading}
          onToggle={() => {
            if (!hasChildren && !isLoading) {
              return;
            }
            void togglePath(path);
          }}
          onSelect={() => onSelectPath(path)}
          onDoubleClick={() => onDoubleClickPath(path)}
        />

        {expanded ? (
          <div className="space-y-0.5">
            {directories.length > 0 ? directories.map((child) => renderNode(child.path, depth + 1)) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return <div className="space-y-0.5">{renderNode(rootPath, 0)}</div>;
}

export default DirectoryTree;
