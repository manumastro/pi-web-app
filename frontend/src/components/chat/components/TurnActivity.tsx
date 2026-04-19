import React from 'react';
import { cn } from '@/lib/utils';

interface TurnActivityProps {
  className?: string;
}

export const TurnActivity: React.FC<TurnActivityProps> = ({ className }) => {
  return (
    <div className={cn('turn-activity', className)}>
      <span className="turn-activity-dot" />
      <span>Working...</span>
    </div>
  );
};

export default TurnActivity;
