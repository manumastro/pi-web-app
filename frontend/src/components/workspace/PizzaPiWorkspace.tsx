import React from 'react';
import { FileText, FolderTree, GitBranch, TerminalIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type WorkspacePanel = 'terminal' | 'files' | 'git' | null;

interface PizzaPiWorkspaceProps {
  children: React.ReactNode;
  activePanel: WorkspacePanel;
  onPanelChange: (panel: WorkspacePanel) => void;
  cwd: string;
}

const PANEL_META = {
  terminal: { label: 'Terminal', icon: TerminalIcon, empty: 'Terminal bridge ready for this project.' },
  files: { label: 'Files', icon: FolderTree, empty: 'File explorer will mirror the current working tree.' },
  git: { label: 'Git', icon: GitBranch, empty: 'Git status and diffs will appear here.' },
} satisfies Record<Exclude<WorkspacePanel, null>, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; empty: string }>;

export function PizzaPiWorkspace({ children, activePanel, onPanelChange, cwd }: PizzaPiWorkspaceProps) {
  const meta = activePanel ? PANEL_META[activePanel] : null;
  const Icon = meta?.icon;

  return (
    <div className={cn('pizzapi-workspace', activePanel && 'with-panel')}>
      <section className="pizzapi-workspace-main">{children}</section>
      {meta && Icon ? (
        <aside className="pizzapi-docked-panel" aria-label={`${meta.label} panel`}>
          <div className="pizzapi-docked-panel-header">
            <div className="pizzapi-docked-panel-title">
              <Icon size={15} />
              <span>{meta.label}</span>
            </div>
            <button type="button" className="pizzapi-icon-button" onClick={() => onPanelChange(null)} aria-label="Close panel">
              <X size={15} />
            </button>
          </div>
          <div className="pizzapi-docked-panel-body">
            <div className="pizzapi-panel-card">
              <div className="pizzapi-panel-card-icon"><Icon size={18} /></div>
              <div>
                <div className="pizzapi-panel-card-title">{meta.empty}</div>
                <div className="pizzapi-panel-card-subtitle">CWD: {cwd}</div>
              </div>
            </div>
            <div className="pizzapi-panel-placeholder-list">
              <div><FileText size={14} /> Session-aware panel chrome copied from PizzaPi.</div>
              <div><FileText size={14} /> Next pass wires real data and actions.</div>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

export type { WorkspacePanel };
