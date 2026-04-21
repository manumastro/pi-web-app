import { useState, useEffect } from 'react';
import { cacheGetItem, cacheSetItem } from '@/lib/frontend-cache';

type Theme = 'light' | 'dark';

export function useTheme(): Theme {
  const [theme] = useState<Theme>(() => {
    const stored = cacheGetItem('theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }

    cacheSetItem('theme', theme);
  }, [theme]);

  return theme;
}

export function toggleTheme() {
  const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';

  if (typeof window !== 'undefined') {
    document.documentElement.classList.add(next);
    document.documentElement.classList.remove(current);
    cacheSetItem('theme', next);
  }

  return next;
}
