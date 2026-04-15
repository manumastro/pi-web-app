import { create } from 'zustand';
import type { WsEvent } from '../types';

// ── Session States ──
export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'working' | 'streaming' | 'error' | 'reconnecting';

// ── State Machine Transitions ──
type TransitionType = 
  | 'CONNECT' 
  | 'CONNECTED' 
  | 'DISCONNECTED'
  | 'WORK_START' 
  | 'WORK_END'
  | 'STREAM_START'
  | 'STREAM_END'
  | 'ERROR'
  | 'RECONNECT';

// ── State Machine Logic ──
const STATE_TRANSITIONS: Record<SessionStatus, Partial<Record<TransitionType, SessionStatus>>> = {
  idle: { CONNECT: 'connecting' },
  connecting: { CONNECTED: 'connected', ERROR: 'error', DISCONNECTED: 'idle' },
  connected: { WORK_START: 'working', ERROR: 'error', DISCONNECTED: 'idle' },
  working: { WORK_END: 'connected', STREAM_START: 'streaming', ERROR: 'error', DISCONNECTED: 'idle' },
  streaming: { STREAM_END: 'working', WORK_END: 'connected', ERROR: 'error', DISCONNECTED: 'idle' },
  error: { RECONNECT: 'reconnecting', CONNECTED: 'connected' },
  reconnecting: { CONNECTED: 'connected', ERROR: 'error' },
};

// ── Retry State ──
export interface RetryState {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
  errorCategory?: string;
  nextRetryTime: number | null;
  totalDelayMs: number;
}

// ── Session Stats ──
export interface SessionStatsData {
  sessionId: string;
  sessionFile: string;
  messages: number;
  model: string | null;
  thinkingLevel: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokensBefore: number;
  contextUsage: number;
  contextWindow: number;
}

// ── Store State ──
interface SessionStatusState {
  // Map sessionId -> status
  statuses: Record<string, SessionStatus>;
  
  // Working start times
  workingStartTime: Record<string, number | null>;
  
  // Retry states
  retryState: Record<string, RetryState | null>;
  
  // Session stats
  sessionStats: Record<string, SessionStatsData>;
  
  // Connection states
  connectionState: Record<string, 'disconnected' | 'connecting' | 'connected' | 'reconnecting'>;
  
  // Actions
  setStatus: (sessionId: string, status: SessionStatus) => void;
  setWorkingStartTime: (sessionId: string, time: number | null) => void;
  getStatus: (sessionId: string) => SessionStatus;
  getWorkingDuration: (sessionId: string) => number | null;
  clearStatus: (sessionId: string) => void;
  
  // Retry actions
  setRetryState: (sessionId: string, state: RetryState | null) => void;
  updateRetryCountdown: (sessionId: string) => number | null;
  
  // Stats actions
  setSessionStats: (sessionId: string, stats: SessionStatsData | null) => void;
  
  // Connection actions
  setConnectionState: (sessionId: string, state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting') => void;
  
  // Process event through state machine
  processEvent: (sessionId: string, event: WsEvent) => void;
  
  // Get state machine info
  getStateHistory: (sessionId: string) => Array<{ from: SessionStatus; to: SessionStatus; transition: string; timestamp: number }>;
}

// ── State History Entry ──
interface HistoryEntry {
  from: SessionStatus;
  to: SessionStatus;
  transition: string;
  timestamp: number;
}

// ── Session-specific state machine history ──
const stateHistory: Record<string, HistoryEntry[]> = {};

// ── Store ──
export const useSessionStatusStore = create<SessionStatusState>((set, get) => ({
  statuses: {},
  workingStartTime: {},
  retryState: {},
  sessionStats: {},
  connectionState: {},
  
  setStatus: (sessionId, status) => set(state => ({
    statuses: { ...state.statuses, [sessionId]: status }
  })),
  
  setWorkingStartTime: (sessionId, time) => set(state => ({
    workingStartTime: { ...state.workingStartTime, [sessionId]: time }
  })),
  
  getStatus: (sessionId) => get().statuses[sessionId] || 'idle',
  
  getWorkingDuration: (sessionId) => {
    const startTime = get().workingStartTime[sessionId];
    if (!startTime) return null;
    return Date.now() - startTime;
  },
  
  clearStatus: (sessionId) => set(state => {
    const { [sessionId]: _, ...rest } = state.statuses;
    const { [sessionId]: __, ...restStart } = state.workingStartTime;
    const { [sessionId]: ___, ...restRetry } = state.retryState;
    const { [sessionId]: ____, ...restStats } = state.sessionStats;
    const { [sessionId]: _____, ...restConn } = state.connectionState;
    delete stateHistory[sessionId];
    return { 
      statuses: rest, 
      workingStartTime: restStart, 
      retryState: restRetry,
      sessionStats: restStats,
      connectionState: restConn,
    };
  }),
  
  setRetryState: (sessionId, retry) => set(state => ({
    retryState: { ...state.retryState, [sessionId]: retry }
  })),
  
  updateRetryCountdown: (sessionId) => {
    const retry = get().retryState[sessionId];
    if (!retry || retry.nextRetryTime === null) return null;
    const remaining = Math.max(0, retry.nextRetryTime - Date.now());
    return Math.ceil(remaining / 1000);
  },
  
  setSessionStats: (sessionId, stats) => set(state => {
    if (stats === null) {
      const { [sessionId]: _, ...rest } = state.sessionStats;
      return { sessionStats: rest };
    }
    return { sessionStats: { ...state.sessionStats, [sessionId]: stats } };
  }),
  
  setConnectionState: (sessionId, connState) => set(state => ({
    connectionState: { ...state.connectionState, [sessionId]: connState }
  })),
  
  processEvent: (sessionId, event) => {
    const currentStatus = get().getStatus(sessionId);
    let transition: TransitionType | null = null;
    let newStatus: SessionStatus | null = null;
    
    switch (event.type) {
      case 'server.connected':
        transition = 'CONNECTED';
        break;
      case 'state':
        if (event.isWorking) {
          transition = 'WORK_START';
        } else {
          transition = 'WORK_END';
        }
        break;
      case 'agent_start':
      case 'turn_start':
        transition = 'WORK_START';
        break;
      case 'done':
      case 'turn_end':
      case 'agent_end':
        transition = 'WORK_END';
        break;
      case 'thinking_start':
      case 'text_start':
      case 'toolcall_start':
      case 'tool_exec_start':
        transition = 'STREAM_START';
        break;
      case 'thinking_end':
      case 'text_end':
      case 'toolcall_end':
      case 'tool_exec_end':
        transition = 'STREAM_END';
        break;
      case 'error':
        transition = 'ERROR';
        break;
      case 'auto_retry_start':
        transition = 'WORK_END'; // Pause current work
        break;
    }
    
    if (transition) {
      const nextStatus = STATE_TRANSITIONS[currentStatus]?.[transition];
      if (nextStatus && nextStatus !== currentStatus) {
        // Record history
        if (!stateHistory[sessionId]) {
          stateHistory[sessionId] = [];
        }
        stateHistory[sessionId].push({
          from: currentStatus,
          to: nextStatus,
          transition,
          timestamp: Date.now(),
        });
        
        // Keep history limited
        if (stateHistory[sessionId].length > 100) {
          stateHistory[sessionId].shift();
        }
        
        // Apply status change
        get().setStatus(sessionId, nextStatus);
        
        // Handle side effects
        if (transition === 'WORK_START') {
          get().setWorkingStartTime(sessionId, Date.now());
        } else if (transition === 'WORK_END') {
          get().setWorkingStartTime(sessionId, null);
        }
      }
    }
  },
  
  getStateHistory: (sessionId) => {
    return stateHistory[sessionId] || [];
  },
}));

// ── Error Category Detection ──
const ERROR_CATEGORY_MAP: Record<string, { label: string; icon: string }> = {
  rate_limit: { label: 'Rate Limited', icon: '⚠️' },
  quota: { label: 'Quota Exceeded', icon: '📊' },
  overload: { label: 'Server Overloaded', icon: '🔥' },
  timeout: { label: 'Request Timeout', icon: '⏱️' },
  network: { label: 'Network Error', icon: '📡' },
  auth: { label: 'Authentication Error', icon: '🔐' },
  api: { label: 'API Error', icon: '🔌' },
  unknown: { label: 'Error', icon: '❌' },
};

export function getErrorCategoryInfo(category: string | undefined): { label: string; icon: string } {
  if (category && ERROR_CATEGORY_MAP[category]) {
    return ERROR_CATEGORY_MAP[category];
  }
  return ERROR_CATEGORY_MAP.unknown;
}

// ── Categorize Error ──
export function categorizeErrorMessage(message: string): string {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('rate limit') || lowerMsg.includes('too_many_requests') || lowerMsg.includes('429')) {
    return 'rate_limit';
  }
  if (lowerMsg.includes('quota') || lowerMsg.includes('exceeded')) {
    return 'quota';
  }
  if (lowerMsg.includes('overload') || lowerMsg.includes('overloaded')) {
    return 'overload';
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
    return 'timeout';
  }
  if (lowerMsg.includes('connection') || lowerMsg.includes('network')) {
    return 'network';
  }
  if (lowerMsg.includes('auth') || lowerMsg.includes('unauthorized')) {
    return 'auth';
  }
  if (lowerMsg.includes('api')) {
    return 'api';
  }
  return 'unknown';
}
