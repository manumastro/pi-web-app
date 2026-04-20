import type { StreamingState } from '@/types';

export type SessionActivityPhase = 'idle' | 'busy' | 'retry';

export interface SessionActivityResult {
  phase: SessionActivityPhase;
  isWorking: boolean;
  isBusy: boolean;
  isCooldown: boolean;
}

const RUNNING_SESSION_STATUSES = new Set([
  'busy',
  'retry',
  'prompting',
  'answering',
  'waiting_question',
  'waiting_permission',
]);

const IDLE_RESULT: SessionActivityResult = {
  phase: 'idle',
  isWorking: false,
  isBusy: false,
  isCooldown: false,
};

export function isRunningSessionStatus(status?: string | null): boolean {
  if (!status) {
    return false;
  }
  return RUNNING_SESSION_STATUSES.has(status);
}

export function getSessionActivityPhase(status?: string | null): SessionActivityPhase {
  if (status === 'retry') {
    return 'retry';
  }
  if (isRunningSessionStatus(status)) {
    return 'busy';
  }
  return 'idle';
}

export function getSessionActivityResult(status?: string | null): SessionActivityResult {
  const phase = getSessionActivityPhase(status);
  if (phase === 'idle') {
    return IDLE_RESULT;
  }

  return {
    phase,
    isWorking: true,
    isBusy: true,
    isCooldown: false,
  };
}

export function getVisualStreamingState(
  status?: string | null,
  transportState: StreamingState = 'idle',
): StreamingState {
  if (isRunningSessionStatus(status)) {
    return 'streaming';
  }

  return transportState;
}
