import React from 'react';
import type { StreamingState } from '@/types';
import { GenericStatusSpinner } from './components/GenericStatusSpinner';

interface StatusRowProps {
  state: StreamingState;
  statusMessage: string;
  onAbort?: () => void;
  showAbort?: boolean;
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}

function normalizeStatusLabel(statusMessage: string): string {
  const trimmed = statusMessage.trim();
  if (!trimmed) {
    return 'Working';
  }

  if (trimmed.endsWith('...')) {
    return trimmed;
  }

  if (trimmed === 'connecting' || trimmed === 'streaming') {
    return 'Working...';
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}${trimmed.endsWith('.') ? '' : '...'}`;
}

export function StatusRow({ state, statusMessage, onAbort, showAbort = true }: StatusRowProps) {
  if (state === 'idle') {
    return null;
  }

  const label = state === 'streaming' || state === 'connecting' ? normalizeStatusLabel(statusMessage) : statusMessage;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface border-t border-border" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-muted-foreground pl-0.5">
        {(state === 'streaming' || state === 'connecting') ? <GenericStatusSpinner className="size-[15px] shrink-0 text-muted-foreground" /> : null}
        <span className="typography-ui-header text-muted-foreground">{label}</span>
      </div>

      {showAbort && (state === 'streaming' || state === 'error') && onAbort && (
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-3 hover:bg-destructive hover:text-destructive-foreground rounded-lg transition-colors"
          onClick={() => void onAbort()}
        >
          <StopIcon />
          Stop
        </button>
      )}
    </div>
  );
}

export default StatusRow;
