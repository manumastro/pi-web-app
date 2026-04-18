import React from 'react';
import { Layers3, Plus, SquareTerminal, PanelRightClose } from 'lucide-react';

interface HeaderProps {
  sessionName: string;
  projectLabel: string;
  onNewSession: () => void;
  onToggleSidebar: () => void;
}

function IconButton({
  title,
  label,
  onClick,
  children,
}: {
  title: string;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon btn-sm"
      onClick={onClick}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}

export function Header({ sessionName, projectLabel, onNewSession, onToggleSidebar }: HeaderProps) {
  const title = sessionName.trim().length > 0 ? sessionName : 'Untitled Session';

  return (
    <header className="app-header">
      <div className="app-header-left">
        <button
          type="button"
          className="btn btn-primary btn-sm header-action-button"
          onClick={onNewSession}
          aria-label="Add action"
          title="Add action"
        >
          <Plus size={16} />
          <span>Add action</span>
        </button>

        <div className="header-title-group">
          <div className="header-title">{title}</div>
          <div className="header-subtitle">{projectLabel}</div>
        </div>
      </div>

      <div className="app-header-right">
        <IconButton title="Layers" label="Layers" onClick={undefined}>
          <Layers3 size={16} />
        </IconButton>
        <IconButton title="Terminal" label="Terminal" onClick={undefined}>
          <SquareTerminal size={16} />
        </IconButton>
        <IconButton title="Toggle sidebar" label="Toggle sidebar" onClick={onToggleSidebar}>
          <PanelRightClose size={16} />
        </IconButton>
      </div>
    </header>
  );
}

export default Header;
