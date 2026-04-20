import { useMemo } from 'react';
import { useSessionStore } from '@/stores/sessionStore';
import { getSessionActivityResult } from '@/sync/sessionActivity';
import type { SessionActivityResult } from '@/sync/sessionActivity';

export function useCurrentSessionActivity(): SessionActivityResult {
  const status = useSessionStore((state) => state.currentSession?.status);

  return useMemo(() => getSessionActivityResult(status), [status]);
}
