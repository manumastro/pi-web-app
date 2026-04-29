import React from 'react';

interface TurnActivityProps {
  phase?: 'idle' | 'busy' | 'retry' | 'cooldown';
  className?: string;
}

export const TurnActivity: React.FC<TurnActivityProps> = ({ phase = 'idle', className }) => {
  const dots = ['one', 'two', 'three'] as const;
  return (
    <span className={`turn-activity turn-activity-${phase} ${className ?? ''}`} aria-hidden="true">
      {dots.map((dot) => (
        <span key={dot} className={`turn-activity-dot turn-activity-dot-${dot}`} />
      ))}
    </span>
  );
};

export default TurnActivity;
