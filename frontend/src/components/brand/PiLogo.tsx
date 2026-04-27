import React from 'react';
import { cn } from '@/lib/utils';

interface PiLogoProps {
  className?: string;
}

export function PiLogo({ className }: PiLogoProps) {
  return (
    <span className={cn('pi-logo', className)} aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img" focusable="false">
        <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#pi-logo-bg)" />
        <path d="M20 24h28" stroke="#151313" strokeWidth="5" strokeLinecap="round" />
        <path d="M27 24v24" stroke="#151313" strokeWidth="5" strokeLinecap="round" />
        <path d="M43 24c-1.5 7.5-1.5 15.5 1.5 24" stroke="#151313" strokeWidth="5" strokeLinecap="round" />
        <circle cx="23" cy="17" r="3.5" fill="#151313" />
        <circle cx="42" cy="17" r="3.5" fill="#151313" />
        <defs>
          <linearGradient id="pi-logo-bg" x1="10" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f9ae77" />
            <stop offset="1" stopColor="#da702c" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}

export default PiLogo;
