import React from 'react';

const COLS = 4;
const ROWS = 4;
const SPACING = 3.2;
const OFFSET = 2.7;
const DOT_R = 0.7;
const cornerIndices = new Set([0, 3, 12, 15]);

const stars = Array.from({ length: COLS * ROWS }, (_, index) => ({
  id: index,
  cx: (index % COLS) * SPACING + OFFSET,
  cy: Math.floor(index / COLS) * SPACING + OFFSET,
  isCorner: cornerIndices.has(index),
  duration: 2.4 + (index % 4) * 0.35,
  delay: (index % 5) * 0.18,
}));

interface GenericStatusSpinnerProps {
  className?: string;
}

export function GenericStatusSpinner({ className }: GenericStatusSpinnerProps) {
  return (
    <svg
      viewBox="0 0 15 15"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      {stars.map((star) => (
        <circle
          key={star.id}
          cx={star.cx}
          cy={star.cy}
          r={DOT_R}
          style={star.isCorner ? { opacity: 0 } : {
            animation: `star-twinkle ${star.duration}s ease-in-out infinite`,
            animationDelay: `${star.delay}s`,
            transformOrigin: 'center',
          }}
        />
      ))}
    </svg>
  );
}

export default GenericStatusSpinner;
