import { create } from 'zustand'

export type SessionStatus = 'idle' | 'working' | 'streaming'

export interface RetryState {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
  errorCategory?: string; // from server
  nextRetryTime: number | null; // timestamp when retry will happen
}

interface SessionStatusState {
  // Map sessionId -> status
  statuses: Record<string, SessionStatus>
  workingStartTime: Record<string, number | null>
  
  // Retry state (keyed by sessionId)
  retryState: Record<string, RetryState | null>
  
  setStatus: (sessionId: string, status: SessionStatus) => void
  setWorkingStartTime: (sessionId: string, time: number | null) => void
  getStatus: (sessionId: string) => SessionStatus
  getWorkingDuration: (sessionId: string) => number | null
  clearStatus: (sessionId: string) => void
  
  // Retry actions
  setRetryState: (sessionId: string, state: RetryState | null) => void
  updateRetryCountdown: (sessionId: string) => void
}

export const useSessionStatusStore = create<SessionStatusState>((set, get) => ({
  statuses: {},
  workingStartTime: {},
  retryState: {},
  
  setStatus: (sessionId, status) => set(state => ({
    statuses: { ...state.statuses, [sessionId]: status }
  })),
  
  setWorkingStartTime: (sessionId, time) => set(state => ({
    workingStartTime: { ...state.workingStartTime, [sessionId]: time }
  })),
  
  getStatus: (sessionId) => get().statuses[sessionId] || 'idle',
  
  getWorkingDuration: (sessionId) => {
    const startTime = get().workingStartTime[sessionId]
    if (!startTime) return null
    return Date.now() - startTime
  },
  
  clearStatus: (sessionId) => set(state => {
    const { [sessionId]: _, ...rest } = state.statuses
    const { [sessionId]: __, ...restStart } = state.workingStartTime
    const { [sessionId]: ___, ...restRetry } = state.retryState
    return { statuses: rest, workingStartTime: restStart, retryState: restRetry }
  }),
  
  setRetryState: (sessionId, retry) => set(state => ({
    retryState: { ...state.retryState, [sessionId]: retry }
  })),
  
  updateRetryCountdown: (sessionId) => {
    const retry = get().retryState[sessionId]
    if (!retry || !retry.nextRetryTime) return null
    const remaining = Math.max(0, retry.nextRetryTime - Date.now())
    return Math.ceil(remaining / 1000) // seconds remaining
  }
}))
