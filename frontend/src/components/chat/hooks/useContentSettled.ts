import React from 'react';

export function useContentSettled(value: string, settleMs = 120): boolean {
  const [settled, setSettled] = React.useState(value.trim().length > 0);

  React.useEffect(() => {
    setSettled(false);
    const timer = window.setTimeout(() => setSettled(true), settleMs);
    return () => window.clearTimeout(timer);
  }, [settleMs, value]);

  return settled;
}
