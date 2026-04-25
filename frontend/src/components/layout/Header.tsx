import React from 'react';
import { Layers3, Menu, Plus, SquareTerminal, PanelRightClose } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface HeaderProps {
  sessionName: string;
  projectLabel: string;
  sidebarOpen?: boolean;
  onNewSession: () => void;
  onToggleSidebar: () => void;
}

function IconButton({
  title,
  label,
  onClick,
  children,
  className,
}: {
  title: string;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className ?? 'btn btn-ghost btn-icon btn-sm'}
      onClick={onClick}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}

export function Header({ sessionName, projectLabel, sidebarOpen = true, onNewSession, onToggleSidebar }: HeaderProps) {
  const title = sessionName.trim().length > 0 ? sessionName : 'Untitled Session';
  const isCompactLayout = useMediaQuery('(max-width: 1024px)');

  if (isCompactLayout) {
    return (
      <header className="app-header app-header-mobile header-safe-area">
        <div className="app-header-mobile-left">
          <IconButton
            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            onClick={onToggleSidebar}
            className="btn btn-ghost btn-icon btn-sm header-mobile-icon-button"
          >
            {sidebarOpen ? <PanelRightClose size={18} /> : <Menu size={18} />}
          </IconButton>
        </div>

        <div className="app-header-mobile-center">
          <div className="header-title-group">
            <div className="header-title">{title}</div>
            <div className="header-subtitle">{projectLabel}</div>
          </div>
        </div>

        <div className="app-header-mobile-right">
          <IconButton
            title="New session"
            label="New session"
            onClick={onNewSession}
            className="btn btn-primary btn-icon btn-sm header-mobile-icon-button header-mobile-primary-button"
          >
            <Plus size={18} />
          </IconButton>
        </div>
      </header>
    );
  }

  return (
    <header className="app-header header-safe-area">
      <div className="app-header-left">
        <button
          type="button"
          className="btn btn-primary btn-sm header-action-button header-action-button-primary"
          onClick={onNewSession}
          aria-label="New session"
          title="New session"
        >
          <Plus size={16} />
          <span>New session</span>
        </button>

        <div className="header-title-group">
          <div className="header-title">{title}</div>
          <div className="header-subtitle">{projectLabel}</div>
        </div>
      </div>

      <div className="app-header-right">
        <IconButton
          title="Layers"
          label="Layers"
          onClick={() => {
            alert('Layers panel coming soon');
          }}
          className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"
        >
          <Layers3 size={16} />
        </IconButton>
        <IconButton
          title="Terminal"
          label="Terminal"
          onClick={() => {
            alert('Terminal coming soon');
          }}
          className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"
        >
          <SquareTerminal size={16} />
        </IconButton>
        <IconButton
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          onClick={onToggleSidebar}
          className="btn btn-ghost btn-icon btn-sm header-action-button"
        >
          {sidebarOpen ? <PanelRightClose size={16} /> : <Menu size={16} />}
        </IconButton>
      </div>
    </header>
  );
}

export default Header;
