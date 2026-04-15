// ── Sync Module ──
// Event pipeline, retry logic, and session state management
// Inspired by OpenChamber's sync module

export { EventBuffer, EventDeduplicator, EventPipeline } from './event-pipeline';
export { 
  RetryScheduler, 
  categorizeError, 
  isRetryable, 
  getSuggestedDelay,
  createRetrySchedulerForError,
} from './retry';
export type { 
  RetryState, 
  ErrorCategory,
  RetryConfig,
} from './retry';
export { 
  SessionStateMachine, 
  ActiveSessionManager, 
} from './session-state';
export type { 
  ActiveSessionState, 
  SessionState, 
  SessionTransition 
} from './session-state';
export { SyncProvider, useSyncContext } from './sync-context';
