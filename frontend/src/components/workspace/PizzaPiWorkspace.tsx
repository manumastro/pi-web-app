import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileText, Folder, FolderTree, GitBranch, RefreshCw, TerminalIcon, X } from 'lucide-react';
import { apiGet, apiRequest } from '@/api';
import { cn } from '@/lib/utils';
type WorkspacePanel = 'terminal' | 'files' | 'git' | null;
interface PizzaPiWorkspaceProps {
  children: React.ReactNode;
  activePanel: WorkspacePanel;
  onPanelChange: (panel: WorkspacePanel) => void;
  cwd: string;
}
interface FileEntry { path: string; name: string; type: 'file' | 'directory'; size?: number; modifiedAt?: string }
interface FileListResponse { path: string; entries: FileEntry[] }
interface FileReadResponse { path: string; content: string; size: number; modifiedAt: string }
interface GitStatusResponse { branch: string; files: Array<{ path: string; index: string; workingTree: string }> }
interface GitDiffResponse { diff: string }
const PANEL_META = {
  terminal: { label: 'Terminal', icon: TerminalIcon },
  files: { label: 'Files', icon: FolderTree },
  git: { label: 'Git', icon: GitBranch },
} satisfies Record<Exclude<WorkspacePanel, null>, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }>;
function query(cwd: string, path = ''): string {
  const params = new URLSearchParams({ cwd });
  if (path) params.set('path', path);
  return params.toString();
}
function formatSize(size?: number): string {
  if (size === undefined) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function FilesPanel({ cwd }: { cwd: string }) {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileReadResponse | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async (nextPath = path) => {
    try {
      setError('');
      const result = await apiGet<FileListResponse>(`/api/workspace/files?${query(cwd, nextPath)}`);
      setPath(result.path === '.' ? '' : result.path);
      setEntries(result.entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [cwd, path]);

  useEffect(() => { void load(''); setSelectedFile(null); }, [cwd]);

  const openFile = async (entry: FileEntry) => {
    if (entry.type === 'directory') {
      setSelectedFile(null);
      await load(entry.path);
      return;
    }
    try {
      setError('');
      setSelectedFile(await apiGet<FileReadResponse>(`/api/workspace/file?${query(cwd, entry.path)}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const crumbs = useMemo(() => path ? path.split('/').filter(Boolean) : [], [path]);

  return (
    <div className="pizzapi-panel-stack">
      <div className="pizzapi-panel-toolbar">
        <button type="button" onClick={() => void load('')} className="pizzapi-mini-button">root</button>
        {crumbs.map((crumb, index) => {
          const crumbPath = crumbs.slice(0, index + 1).join('/');
          return <button key={crumbPath} type="button" onClick={() => void load(crumbPath)} className="pizzapi-crumb"><ChevronRight size={12} />{crumb}</button>;
        })}
        <button type="button" onClick={() => void load()} className="pizzapi-icon-button ml-auto" aria-label="Refresh files"><RefreshCw size={14} /></button>
      </div>
      {error ? <div className="pizzapi-panel-error">{error}</div> : null}
      <div className="pizzapi-file-list">
        {entries.map((entry) => {
          const Icon = entry.type === 'directory' ? Folder : FileText;
          return (
            <button key={entry.path} type="button" className={cn('pizzapi-file-row', selectedFile?.path === entry.path && 'active')} onClick={() => void openFile(entry)}>
              <Icon size={14} />
              <span className="truncate">{entry.name}</span>
              <span className="pizzapi-file-meta">{formatSize(entry.size)}</span>
            </button>
          );
        })}
      </div>
      {selectedFile ? (
        <div className="pizzapi-file-viewer">
          <div className="pizzapi-file-viewer-title">{selectedFile.path} · {formatSize(selectedFile.size)}</div>
          <pre>{selectedFile.content}</pre>
        </div>
      ) : null}
    </div>
  );
}

function GitPanel({ cwd }: { cwd: string }) {
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [diff, setDiff] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setStatus(await apiGet<GitStatusResponse>(`/api/workspace/git/status?${query(cwd)}`));
      const result = await apiGet<GitDiffResponse>(`/api/workspace/git/diff?${query(cwd)}`);
      setDiff(result.diff);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [cwd]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="pizzapi-panel-stack">
      <div className="pizzapi-panel-toolbar">
        <span className="pizzapi-branch-pill"><GitBranch size={13} /> {status?.branch ?? 'loading'}</span>
        <button type="button" onClick={() => void load()} className="pizzapi-icon-button ml-auto" aria-label="Refresh git"><RefreshCw size={14} /></button>
      </div>
      {error ? <div className="pizzapi-panel-error">{error}</div> : null}
      <div className="pizzapi-file-list">
        {status?.files.length ? status.files.map((file) => (
          <button key={`${file.index}${file.workingTree}${file.path}`} type="button" className="pizzapi-file-row" onClick={async () => {
            const result = await apiGet<GitDiffResponse>(`/api/workspace/git/diff?${query(cwd, file.path)}`);
            setDiff(result.diff || 'No unstaged diff for this file.');
          }}>
            <span className="pizzapi-git-status">{file.index}{file.workingTree}</span>
            <span className="truncate">{file.path}</span>
          </button>
        )) : <div className="pizzapi-panel-muted">Working tree clean.</div>}
      </div>
      <div className="pizzapi-file-viewer"><pre>{diff || 'No diff.'}</pre></div>
    </div>
  );
}

function TerminalPanel({ cwd }: { cwd: string }) {
  const [command, setCommand] = useState('pwd && ls');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [terminalId, setTerminalId] = useState('');
  const [source, setSource] = useState<EventSource | null>(null);

  useEffect(() => () => source?.close(), [source]);

  const stop = async () => {
    source?.close();
    setSource(null);
    setRunning(false);
    if (terminalId) {
      await apiRequest(`/api/workspace/terminal/${encodeURIComponent(terminalId)}`, { method: 'DELETE' }).catch(() => undefined);
    }
  };

  const run = () => {
    if (!command.trim()) return;
    void stop();
    const nextTerminalId = `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setTerminalId(nextTerminalId);
    setOutput(`$ ${command}\n`);
    setRunning(true);
    const params = new URLSearchParams({ cwd, command, terminalId: nextTerminalId });
    const nextSource = new EventSource(`/api/workspace/terminal/stream?${params.toString()}`);
    nextSource.addEventListener('output', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { chunk?: string };
      setOutput((current) => current + (payload.chunk ?? ''));
    });
    nextSource.addEventListener('exit', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { code?: number | null; signal?: string | null };
      setOutput((current) => `${current}\n(exit ${String(payload.code ?? payload.signal ?? 0)})`);
      setRunning(false);
      nextSource.close();
      setSource(null);
    });
    nextSource.onerror = () => {
      setOutput((current) => `${current}\n[terminal stream closed]`);
      setRunning(false);
      nextSource.close();
      setSource(null);
    };
    setSource(nextSource);
  };

  return (
    <div className="pizzapi-panel-stack">
      <div className="pizzapi-terminal-box"><pre>{output || `Terminal scoped to ${cwd}`}</pre></div>
      <form className="pizzapi-terminal-form" onSubmit={(event) => { event.preventDefault(); run(); }}>
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Command" />
        <button type="submit" className="pizzapi-mini-button" disabled={running}>{running ? 'Running…' : 'Run'}</button>
        {running ? <button type="button" className="pizzapi-mini-button" onClick={() => void stop()}>Kill</button> : null}
      </form>
    </div>
  );
}

export function PizzaPiWorkspace({ children, activePanel, onPanelChange, cwd }: PizzaPiWorkspaceProps) {
  const meta = activePanel ? PANEL_META[activePanel] : null;
  const Icon = meta?.icon;

  return (
    <div className={cn('pizzapi-workspace', activePanel && 'with-panel')}>
      <section className="pizzapi-workspace-main">{children}</section>
      {meta && Icon ? (
        <aside className="pizzapi-docked-panel" aria-label={`${meta.label} panel`}>
          <div className="pizzapi-docked-panel-header">
            <div className="pizzapi-docked-panel-title"><Icon size={15} /><span>{meta.label}</span></div>
            <button type="button" className="pizzapi-icon-button" onClick={() => onPanelChange(null)} aria-label="Close panel"><X size={15} /></button>
          </div>
          <div className="pizzapi-docked-panel-body">
            {activePanel === 'files' ? <FilesPanel cwd={cwd} /> : null}
            {activePanel === 'git' ? <GitPanel cwd={cwd} /> : null}
            {activePanel === 'terminal' ? <TerminalPanel cwd={cwd} /> : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

export type { WorkspacePanel };
