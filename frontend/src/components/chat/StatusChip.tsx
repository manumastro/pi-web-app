import React from 'react';
import { cn } from '@/lib/utils';
import type { StreamingState } from '@/types';

interface StatusChipProps {
  state: StreamingState;
  message: string;
  agentName?: string;
  modelName?: string;
  onClick?: () => void;
  className?: string;
}

export function StatusChip({
  state,
  message,
  agentName,
  modelName,
  onClick,
  className,
}: StatusChipProps) {
  const chipClass = cn(
    'status-chip',
    (state === 'streaming' || state === 'connecting') && 'connecting',
    state === 'error' && 'error',
    onClick && 'cursor-pointer hover:bg-surface-3',
    className
  );

  const dots =
    state === 'streaming' || state === 'connecting' ? (
      <span className="thinking-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    ) : null;

  const fullLabel = [agentName, modelName, message].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      className={chipClass}
      title={fullLabel}
      disabled={!onClick}
    >
      {dots}
      <span className="truncate max-w-[200px]">{message}</span>
    </button>
  );
}

export default StatusChip;
