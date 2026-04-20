import React from 'react';
import { cn } from '@/lib/utils';
import { GenericStatusSpinner } from './GenericStatusSpinner';

interface WorkingPlaceholderProps {
  label?: string;
  className?: string;
}

export function WorkingPlaceholder({ label = 'Working...', className }: WorkingPlaceholderProps) {
  return (
    <div className={cn('working-placeholder', className)} role="status" aria-live="polite">
      <span className="working-placeholder-spinner" aria-hidden="true">
        <GenericStatusSpinner className="size-[15px] shrink-0 text-muted-foreground" />
      </span>
      <span className="working-placeholder-label typography-ui-header text-muted-foreground">{label}</span>
    </div>
  );
}

export default WorkingPlaceholder;
