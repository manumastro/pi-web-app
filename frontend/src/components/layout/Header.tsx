import React from 'react';
import { cn } from '@/lib/utils';
import type { StreamingState } from '@/types';

interface HeaderProps {
  sessionName: string;
  state: StreamingState;
  statusMessage: string;
  onToggleSidebar: () => void;
}

function StatusChip({ state, message }: { state: StreamingState; message: string }) {
  const className = cn(
    'status-chip',
    (state === 'streaming' || state === 'connecting') && 'connecting',
    state === 'error' && 'error'
  );

  const dots =
    state === 'streaming' || state === 'connecting' ? (
      <span className="thinking-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    ) : null;

  return (
    <span className={className} title={message}>
      {dots}
      {message}
    </span>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}

export function Header({ sessionName, state, statusMessage, onToggleSidebar }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          title="Sidebar"
        >
          <MenuIcon />
        </button>

        <span className="text-sm font-medium text-foreground truncate">
          {sessionName || 'Nessuna sessione'}
        </span>
      </div>

      <div className="app-header-right">
        <StatusChip state={state} message={statusMessage} />
      </div>
    </header>
  );
}

export default Header;
