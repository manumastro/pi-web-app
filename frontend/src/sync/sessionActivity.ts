import type { StreamingState } from '@/types';
import type { StreamPhase } from './streaming';

export type SessionActivityPhase = 'idle' | 'busy' | 'retry' | 'cooldown';
export type SessionStatusLike = string | { type?: string | null } | null | undefined;

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

export function getSessionStatusType(status?: SessionStatusLike): string | undefined {
  if (!status) {
    return undefined;
  }
  if (typeof status === 'string') {
    return status;
  }
  return typeof status.type === 'string' ? status.type : undefined;
}

export function isRunningSessionStatus(status?: SessionStatusLike): boolean {
  const type = getSessionStatusType(status);
  if (!type) {
    return false;
  }
  return RUNNING_SESSION_STATUSES.has(type);
}

export function getSessionActivityPhase(status?: SessionStatusLike): SessionActivityPhase {
  const type = getSessionStatusType(status);
  if (type === 'retry') {
    return 'retry';
  }
  if (isRunningSessionStatus(type)) {
    return 'busy';
  }
  return 'idle';
}

export function getSessionActivityResult(status?: SessionStatusLike): SessionActivityResult {
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

export function getSessionActivityResultWithStreaming(
  status?: SessionStatusLike,
  streamPhase?: StreamPhase | null,
): SessionActivityResult {
  if (streamPhase === 'cooldown') {
    return {
      phase: 'cooldown',
      isWorking: true,
      isBusy: false,
      isCooldown: true,
    };
  }

  if (streamPhase === 'streaming') {
    return {
      phase: 'busy',
      isWorking: true,
      isBusy: true,
      isCooldown: false,
    };
  }

  return getSessionActivityResult(status);
}

export function getVisualStreamingState(
  status?: string | null,
  transportState: StreamingState = 'idle',
  streamPhase?: StreamPhase | null,
): StreamingState {
  if (streamPhase === 'streaming' || streamPhase === 'cooldown' || isRunningSessionStatus(status)) {
    return 'streaming';
  }

  return transportState;
}
