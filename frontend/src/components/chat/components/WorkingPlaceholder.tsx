import React from 'react';
import { cn } from '@/lib/utils';
import { GenericStatusSpinner } from './GenericStatusSpinner';

interface WorkingPlaceholderProps {
  label?: string;
  className?: string;
  activity?: 'idle' | 'streaming' | 'tooling' | 'permission' | 'retry' | 'cooldown' | 'complete';
  statusText?: string | null;
}

export function WorkingPlaceholder({
  label = 'Working...',
  className,
  activity = 'streaming',
  statusText,
}: WorkingPlaceholderProps) {
  const resolvedLabel = statusText?.trim() || label;

  return (
    <div className={cn('working-placeholder', className)} role="status" aria-live="polite">
      <span className="working-placeholder-spinner" aria-hidden="true">
        <GenericStatusSpinner className="size-[15px] shrink-0 text-muted-foreground" />
      </span>
      <span className={cn('working-placeholder-label typography-ui-header text-muted-foreground', `working-placeholder-${activity}`)}>
        {resolvedLabel}
      </span>
    </div>
  );
}

export default WorkingPlaceholder;
