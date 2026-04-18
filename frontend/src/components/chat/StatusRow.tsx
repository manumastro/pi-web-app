import React from 'react';
import type { StreamingState } from '@/types';

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

function ThinkingDots() {
  return (
    <span className="thinking-dots" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

export function StatusRow({ state, statusMessage, onAbort, showAbort = true }: StatusRowProps) {
  if (state === 'idle') {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface border-t border-border">
      <div className="flex items-center gap-2">
        {(state === 'streaming' || state === 'connecting') && <ThinkingDots />}
        <span className="text-xs text-muted-foreground">{statusMessage}</span>
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
