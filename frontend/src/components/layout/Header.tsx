import React from 'react';
import { Clock, FolderTree, GitBranch, HardDrive, Keyboard, Menu, Moon, Plus, Settings, SquareTerminal, PanelRightClose } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { PizzaLogo } from '@/components/brand/PizzaLogo';

interface HeaderProps {
  sessionName: string;
  projectLabel: string;
  relayStatusMessage?: string;
  relayConnected?: boolean;
  sidebarOpen?: boolean;
  onNewSession: () => void;
  onToggleSidebar: () => void;
  onToggleTerminal?: () => void;
  onToggleFiles?: () => void;
  onToggleGit?: () => void;
  onOpenCommandPalette?: () => void;
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

export function Header({
  sessionName,
  projectLabel,
  relayStatusMessage = 'Relay connected',
  relayConnected = true,
  sidebarOpen = true,
  onNewSession,
  onToggleSidebar,
  onToggleTerminal,
  onToggleFiles,
  onToggleGit,
  onOpenCommandPalette,
}: HeaderProps) {
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
          <div className="pizzapi-mobile-brand">
            <PizzaLogo className="pizza-logo-mobile" />
            <div className="header-title-group">
              <div className="header-title">{title}</div>
              <div className="header-subtitle">{projectLabel}</div>
            </div>
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
      <div className="app-header-left pizzapi-header-left">
        <div className="pizzapi-brand-cluster">
          <PizzaLogo />
          <span className="pizzapi-brand-name">PizzaPi</span>
        </div>
        <span className="pizzapi-separator" />
        <div className="pizzapi-relay-status" title={relayStatusMessage}>
          <span className="pizzapi-live-dot" style={!relayConnected ? { opacity: 0.45 } : undefined} />
          <span>{relayStatusMessage}</span>
        </div>
        <span className="pizzapi-separator" />
        <div className="header-title-group pizzapi-session-heading">
          <div className="header-title">{title}</div>
          <div className="header-subtitle">{projectLabel}</div>
        </div>
      </div>

      <div className="app-header-right pizzapi-header-right">
        <IconButton
          title="Session history"
          label="Session history"
          onClick={onOpenCommandPalette}
          className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"
        >
          <Clock size={16} />
        </IconButton>
        <IconButton
          title="Files"
          label="Files"
          onClick={onToggleFiles}
          className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"
        >
          <FolderTree size={16} />
        </IconButton>
        <IconButton
          title="Terminal"
          label="Terminal"
          onClick={onToggleTerminal}
          className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"
        >
          <SquareTerminal size={16} />
        </IconButton>
        <IconButton
          title="Git"
          label="Git"
          onClick={onToggleGit}
          className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"
        >
          <GitBranch size={16} />
        </IconButton>
        <button
          type="button"
          className="btn btn-primary btn-sm header-action-button header-action-button-primary"
          onClick={onNewSession}
          aria-label="New session"
          title="New session"
        >
          <Plus size={16} />
          <span>New</span>
        </button>
        <IconButton title="Theme" label="Theme" className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"><Moon size={16} /></IconButton>
        <IconButton title="API keys" label="API keys" className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"><HardDrive size={16} /></IconButton>
        <IconButton title="Keyboard shortcuts" label="Keyboard shortcuts" onClick={onOpenCommandPalette} className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"><Keyboard size={16} /></IconButton>
        <IconButton title="Preferences" label="Preferences" className="btn btn-ghost btn-icon btn-sm header-action-button header-action-button--secondary"><Settings size={16} /></IconButton>
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
