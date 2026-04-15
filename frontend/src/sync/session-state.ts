// ── Session State Machine ──
// Inspired by OpenChamber's session state management
// RFC 6449 - Session state machine with explicit transitions

import type { WsEvent } from '../types';

// ── Session States ──
export type SessionState = 
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'loading'
  | 'working'
  | 'streaming'
  | 'paused'
  | 'error'
  | 'reconnecting'
  | 'disconnected';

// ── State Transitions ──
export type SessionTransition =
  | { type: 'CONNECT' }
  | { type: 'CONNECTED' }
  | { type: 'LOAD_SESSION'; sessionId: string }
  | { type: 'SESSION_LOADED' }
  | { type: 'WORK_START' }
  | { type: 'WORK_END' }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_END' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'ERROR'; error: string }
  | { type: 'RECONNECT' }
  | { type: 'DISCONNECT' }
  | { type: 'RESET' };

// ── State Machine ──
const STATE_TRANSITIONS: Record<SessionState, Partial<Record<SessionTransition['type'], SessionState>>> = {
  idle: {
    CONNECT: 'connecting',
  },
  connecting: {
    CONNECTED: 'connected',
    ERROR: 'error',
    DISCONNECT: 'disconnected',
  },
  connected: {
    LOAD_SESSION: 'loading',
    WORK_START: 'working',
    RECONNECT: 'reconnecting',
    DISCONNECT: 'disconnected',
  },
  loading: {
    SESSION_LOADED: 'connected',
    WORK_START: 'working',
    ERROR: 'error',
    DISCONNECT: 'disconnected',
  },
  working: {
    WORK_END: 'connected',
    STREAM_START: 'streaming',
    ERROR: 'error',
    DISCONNECT: 'disconnected',
  },
  streaming: {
    STREAM_END: 'working',
    WORK_END: 'connected',
    ERROR: 'error',
    DISCONNECT: 'disconnected',
  },
  paused: {
    RESUME: 'working',
    ERROR: 'error',
    DISCONNECT: 'disconnected',
  },
  error: {
    RECONNECT: 'reconnecting',
    RESET: 'idle',
    DISCONNECT: 'disconnected',
  },
  reconnecting: {
    CONNECTED: 'connected',
    ERROR: 'error',
    DISCONNECT: 'disconnected',
  },
  disconnected: {
    CONNECT: 'connecting',
  },
};

// ── Session State Machine ──
export class SessionStateMachine {
  private state: SessionState = 'idle';
  private sessionId: string | null = null;
  private errorMessage: string | null = null;
  private lastTransition: Date = new Date();
  private listeners: Set<(state: SessionState, prevState: SessionState) => void> = new Set();
  private history: Array<{ state: SessionState; transition: string; timestamp: Date }> = [];

  /**
   * Get current state
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get current error message
   */
  getError(): string | null {
    return this.errorMessage;
  }

  /**
   * Get last transition time
   */
  getLastTransitionTime(): Date {
    return this.lastTransition;
  }

  /**
   * Get state history
   */
  getHistory(): Array<{ state: SessionState; transition: string; timestamp: Date }> {
    return [...this.history];
  }

  /**
   * Check if in a terminal state
   */
  isTerminal(): boolean {
    return this.state === 'disconnected' || this.state === 'error';
  }

  /**
   * Check if can transition to a new state
   */
  canTransition(transition: SessionTransition): boolean {
    const validNextStates = STATE_TRANSITIONS[this.state];
    return transition.type in validNextStates;
  }

  /**
   * Process a transition
   */
  transition(t: SessionTransition): boolean {
    const validNextStates = STATE_TRANSITIONS[this.state];
    const nextState = validNextStates[t.type];

    if (!nextState) {
      console.warn(`[SessionStateMachine] Invalid transition: ${t.type} from ${this.state}`);
      return false;
    }

    const prevState = this.state;
    this.state = nextState;
    this.lastTransition = new Date();

    // Update session ID for LOAD_SESSION
    if (t.type === 'LOAD_SESSION') {
      this.sessionId = t.sessionId;
    }

    // Update error for ERROR
    if (t.type === 'ERROR') {
      this.errorMessage = t.error;
    }

    // Clear error on successful transitions
    if (t.type !== 'ERROR' && this.errorMessage) {
      this.errorMessage = null;
    }

    // Record history
    this.history.push({
      state: nextState,
      transition: t.type,
      timestamp: new Date(),
    });

    // Keep history limited
    if (this.history.length > 50) {
      this.history.shift();
    }

    console.log(`[SessionStateMachine] ${prevState} → ${nextState} (${t.type})`);

    // Notify listeners
    this.notifyListeners(nextState, prevState);

    return true;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: SessionState, prevState: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(state: SessionState, prevState: SessionState): void {
    for (const listener of this.listeners) {
      try {
        listener(state, prevState);
      } catch (e) {
        console.error('[SessionStateMachine] Listener error:', e);
      }
    }
  }

  /**
   * Process incoming event and update state
   */
  processEvent(event: WsEvent): void {
    switch (event.type) {
      case 'state':
        if (event.isWorking) {
          this.transition({ type: 'WORK_START' });
        } else {
          this.transition({ type: 'WORK_END' });
        }
        break;

      case 'server.connected':
        this.transition({ type: 'CONNECTED' });
        break;

      case 'session_loaded':
        this.transition({ type: 'SESSION_LOADED' });
        if (event.sessionId) {
          this.sessionId = event.sessionId;
        }
        break;

      case 'session_created':
        if (event.sessionId) {
          this.sessionId = event.sessionId;
          this.transition({ type: 'LOAD_SESSION', sessionId: event.sessionId });
        }
        break;

      case 'agent_start':
        this.transition({ type: 'WORK_START' });
        break;

      case 'done':
        this.transition({ type: 'WORK_END' });
        break;

      case 'error':
        this.transition({ type: 'ERROR', error: event.message });
        break;

      case 'thinking_start':
      case 'text_start':
      case 'toolcall_start':
      case 'tool_exec_start':
        if (this.state !== 'streaming') {
          this.transition({ type: 'STREAM_START' });
        }
        break;

      case 'thinking_end':
      case 'text_end':
      case 'toolcall_end':
      case 'tool_exec_end':
        // Don't transition back to working here - wait for done or next stream start
        break;

      case 'auto_retry_start':
        this.transition({ type: 'PAUSE' });
        break;

      case 'auto_retry_end':
        if (event.success) {
          this.transition({ type: 'RESUME' });
        } else {
          this.transition({ type: 'ERROR', error: event.finalError || 'Retry failed' });
        }
        break;
    }
  }

  /**
   * Reset state machine
   */
  reset(): void {
    this.state = 'idle';
    this.sessionId = null;
    this.errorMessage = null;
    this.history = [];
    this.notifyListeners(this.state, 'idle');
  }
}

// ── Active Session State ──
// Manages the active session with its state machine
export interface ActiveSessionState {
  sessionId: string;
  cwd: string;
  stateMachine: SessionStateMachine;
  reconnectAttempts: number;
  lastActivity: Date;
}

export class ActiveSessionManager {
  private sessions: Map<string, ActiveSessionState> = new Map();

  /**
   * Create or get active session
   */
  getOrCreate(sessionId: string, cwd: string): ActiveSessionState {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = {
        sessionId,
        cwd,
        stateMachine: new SessionStateMachine(),
        reconnectAttempts: 0,
        lastActivity: new Date(),
      };
      this.sessions.set(sessionId, session);
    }
    
    return session;
  }

  /**
   * Get session by ID
   */
  get(sessionId: string): ActiveSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Remove session
   */
  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get all sessions
   */
  getAll(): ActiveSessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
  }
}
