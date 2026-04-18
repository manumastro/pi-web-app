import React from 'react';

interface ChatEmptyStateProps {
  onNewSession?: () => void;
}

function OpenChamberLogo({ width = 140, height = 140, className }: { width?: number; height?: number; className?: string }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />
      <path
        d="M30 50h40M50 30v40"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="50" cy="50" r="8" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export function ChatEmptyState({ onNewSession }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full gap-6">
      <OpenChamberLogo className="opacity-20" />
      <span className="text-sm text-muted">Start a new chat</span>
      {onNewSession && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onNewSession}
        >
          Nuova sessione
        </button>
      )}
    </div>
  );
}

export default ChatEmptyState;
