import { create } from 'zustand'

export type SessionStatus = 'idle' | 'working' | 'streaming'

interface SessionStatusState {
  // Map sessionId -> status
  statuses: Record<string, SessionStatus>
  workingStartTime: Record<string, number | null>
  
  setStatus: (sessionId: string, status: SessionStatus) => void
  setWorkingStartTime: (sessionId: string, time: number | null) => void
  getStatus: (sessionId: string) => SessionStatus
  getWorkingDuration: (sessionId: string) => number | null
  clearStatus: (sessionId: string) => void
}

export const useSessionStatusStore = create<SessionStatusState>((set, get) => ({
  statuses: {},
  workingStartTime: {},
  
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
    return { statuses: rest, workingStartTime: restStart }
  })
}))
