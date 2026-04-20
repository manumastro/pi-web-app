import { useMemo } from 'react';
import { useSessionStore } from '@/stores/sessionStore';
import { getSessionActivityResult } from '@/lib/sessionActivity';
import type { SessionActivityResult } from '@/lib/sessionActivity';

export function useCurrentSessionActivity(): SessionActivityResult {
  const status = useSessionStore((state) => state.currentSession?.status);

  return useMemo(() => getSessionActivityResult(status), [status]);
}
