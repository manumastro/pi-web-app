import React from 'react';
import { cn } from '@/lib/utils';

interface PizzaLogoProps {
  className?: string;
}

export function PizzaLogo({ className }: PizzaLogoProps) {
  return (
    <span className={cn('pizza-logo', className)} aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img" focusable="false">
        <circle cx="32" cy="32" r="28" fill="#f2b15f" />
        <circle cx="32" cy="32" r="23" fill="#ffd166" />
        <path d="M32 32 L32 6 A26 26 0 0 1 54.5 19 Z" fill="#f7c453" opacity="0.95" />
        <path d="M32 32 L54.5 19 A26 26 0 0 1 58 40 Z" fill="#ffd166" />
        <path d="M32 32 L58 40 A26 26 0 0 1 42 57 Z" fill="#f7c453" opacity="0.95" />
        <path d="M32 32 L42 57 A26 26 0 0 1 18 56 Z" fill="#ffd166" />
        <path d="M32 32 L18 56 A26 26 0 0 1 6 35 Z" fill="#f7c453" opacity="0.95" />
        <path d="M32 32 L6 35 A26 26 0 0 1 13 15 Z" fill="#ffd166" />
        <circle cx="23" cy="20" r="4" fill="#d43d32" />
        <circle cx="42" cy="24" r="4" fill="#d43d32" />
        <circle cx="45" cy="43" r="4" fill="#d43d32" />
        <circle cx="22" cy="43" r="4" fill="#d43d32" />
        <circle cx="33" cy="34" r="3" fill="#24211f" />
        <path d="M16 30c5-5 9-5 14 0M36 50c2-6 6-8 12-7" stroke="#358a46" strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}

export default PizzaLogo;
