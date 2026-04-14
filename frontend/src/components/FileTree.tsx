import { memo, useState, useEffect } from 'react';
import { useFileTree, type FileEntry } from '../hooks/useFileTree';

interface FileTreeProps {
  initialPath?: string;
  selectedWorkspace?: string;
  onFileSelect?: (entry: FileEntry) => void;
  onDirectoryChange?: (path: string) => void;
  onSelectWorkspace?: (path: string) => void;
}

export const FileTree = memo(function FileTree({ initialPath = '/home/manu', selectedWorkspace, onFileSelect, onDirectoryChange, onSelectWorkspace }: FileTreeProps) {
  const { currentPath, data, loading, error, loadDirectory, goUp, navigateTo } = useFileTree(initialPath);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDirectory(initialPath);
  }, [initialPath, loadDirectory]);

  useEffect(() => {
    if (currentPath && onDirectoryChange) {
      onDirectoryChange(currentPath);
    }
  }, [currentPath, onDirectoryChange]);

  const handleDirectoryClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      navigateTo(entry);
      setExpandedDirs(prev => {
        const next = new Set(prev);
        if (next.has(entry.path)) {
          next.delete(entry.path);
        } else {
          next.add(entry.path);
        }
        return next;
      });
    } else {
      onFileSelect?.(entry);
    }
  };

  const handleDirectoryDoubleClick = (entry: FileEntry) => {
    if (entry.isDirectory && onSelectWorkspace) {
      onSelectWorkspace(entry.path);
    }
  };

  const getFileIcon = (entry: FileEntry) => {
    if (entry.isDirectory) {
      return expandedDirs.has(entry.path) ? '📂' : '📁';
    }
    const ext = entry.name.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      'js': '🟨',
      'ts': '🔷',
      'jsx': '🟨',
      'tsx': '🔷',
      'json': '📋',
      'md': '📝',
      'html': '🌐',
      'css': '🎨',
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'gif': '🖼️',
      'svg': '🖼️',
      'py': '🐍',
      'rs': '🦀',
      'go': '🐹',
      'sh': '🖥️',
      'yml': '⚙️',
      'yaml': '⚙️',
      'toml': '⚙️',
    };
    return iconMap[ext || ''] || '📄';
  };

  const formatSize = (size: number) => {
    if (size === 0) return '';
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-4 text-[var(--color-text-muted)]">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-[var(--color-red)]">
        Error: {error}
      </div>
    );
  }

  if (!data) return null;

  // Get parent path
  const pathParts = currentPath.split('/').filter(Boolean);
  const canGoUp = pathParts.length > 1;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
        {canGoUp && (
          <button
            onClick={goUp}
            className="p-1 hover:bg-[var(--color-surface-3)] rounded text-sm"
            title="Go up"
          >
            ↩
          </button>
        )}
        <input
          type="text"
          value={currentPath}
          onChange={(e) => loadDirectory(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadDirectory(e.currentTarget.value)}
          className="flex-1 bg-transparent text-xs font-mono text-[var(--color-text)] outline-none"
          placeholder="/path/to/dir"
        />
        <button
          onClick={() => loadDirectory(currentPath)}
          className="p-1 hover:bg-[var(--color-surface-3)] rounded text-sm"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* Path breadcrumb */}
      <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--color-text-dim)] overflow-x-auto">
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center">
            {i > 0 && <span className="mx-1">/</span>}
            <button
              onClick={() => {
                const newPath = '/' + pathParts.slice(0, i + 1).join('/');
                loadDirectory(newPath);
              }}
              className="hover:text-[var(--color-text)]"
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1">
        {data.entries.length === 0 ? (
          <div className="text-center text-[var(--color-text-muted)] py-8 text-xs">
            Empty directory
          </div>
        ) : (
          data.entries.map((entry) => (
            <div
              key={entry.path}
              onClick={() => handleDirectoryClick(entry)}
              onDoubleClick={() => handleDirectoryDoubleClick(entry)}
              className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[var(--color-surface-2)] text-xs group ${selectedWorkspace === entry.path ? 'bg-[var(--color-accent)]/10' : ''}`}
            >
              <span className="w-4 text-center">{getFileIcon(entry)}</span>
              <span className="flex-1 truncate text-[var(--color-text)]">
                {entry.name}
              </span>
              {entry.isDirectory && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSelectWorkspace?.(entry.path); }}
                  className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${selectedWorkspace === entry.path ? '!opacity-100 text-[var(--color-accent)]' : 'hover:text-[var(--color-accent)]'}`}
                  title="Set as workspace"
                >
                  {selectedWorkspace === entry.path ? '✓' : '◇'}
                </button>
              )}
              {entry.size > 0 && (
                <span className="text-[var(--color-text-dim)] text-[10px]">
                  {formatSize(entry.size)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
});