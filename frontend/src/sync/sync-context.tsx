// ── Sync Context ──
// Global synchronization context with resumption support
// Inspired by OpenChamber's sync/sync-context.tsx

import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import type { WsEvent } from '../types';
import { EventPipeline } from './event-pipeline';
import { RetryScheduler, createRetrySchedulerForError } from './retry';
import type { RetryState } from './retry';
import { SessionStateMachine, ActiveSessionManager } from './session-state';
import type { ActiveSessionState } from './session-state';

// ── Sync Context Types ──
export interface SyncContextState {
  // Connection state
  connected: boolean;
  reconnecting: boolean;
  
  // Session state
  sessionId: string | null;
  isWorking: boolean;
  
  // Retry state
  retryState: RetryState | null;
  
  // Stream state
  lastEventId: number;
  pendingEvents: number;
}

export interface SyncContextActions {
  // Event handling
  pushEvent: (event: WsEvent) => void;
  
  // Connection control
  reconnect: () => void;
  disconnect: () => void;
  
  // Session control
  setActiveSession: (sessionId: string | null) => void;
  
  // Retry control
  cancelRetry: () => void;
  retryNow: () => void;
}

type SyncContextType = SyncContextState & SyncContextActions;

// ── Default Values ──
const defaultState: SyncContextState = {
  connected: false,
  reconnecting: false,
  sessionId: null,
  isWorking: false,
  retryState: null,
  lastEventId: 0,
  pendingEvents: 0,
};

// ── Context ──
const SyncContext = createContext<SyncContextType>({
  ...defaultState,
  pushEvent: () => {},
  reconnect: () => {},
  disconnect: () => {},
  setActiveSession: () => {},
  cancelRetry: () => {},
  retryNow: () => {},
});

// ── Provider Props ──
export interface SyncProviderProps {
  children: React.ReactNode;
  cwd: string;
  sessionId: string | null;
  onEvent: (event: WsEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  authToken?: string;
}

// ── Sync Provider ──
export function SyncProvider({
  children,
  cwd,
  sessionId,
  onEvent,
  onConnected,
  onDisconnected,
  authToken,
}: SyncProviderProps) {
  // State
  const [state, setState] = useState<SyncContextState>({
    ...defaultState,
    sessionId,
  });
  
  // Refs
  const eventPipelineRef = useRef<EventPipeline | null>(null);
  const retrySchedulerRef = useRef<RetryScheduler | null>(null);
  const sessionManagerRef = useRef<ActiveSessionManager>(new ActiveSessionManager());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  
  // Keep refs updated
  onEventRef.current = onEvent;
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  
  // Initialize event pipeline
  useEffect(() => {
    eventPipelineRef.current = new EventPipeline(cwd, (events) => {
      for (const event of events) {
        onEventRef.current(event);
      }
    });
    
    return () => {
      eventPipelineRef.current?.clear();
    };
  }, [cwd]);
  
  // Update session ID in state
  useEffect(() => {
    setState(prev => ({ ...prev, sessionId }));
  }, [sessionId]);
  
  // Update session manager
  useEffect(() => {
    if (sessionId) {
      const activeSession = sessionManagerRef.current.getOrCreate(sessionId, cwd);
      
      // Subscribe to state machine updates
      activeSession.stateMachine.subscribe((newState, prevState) => {
        setState(prev => ({
          ...prev,
          isWorking: newState === 'working' || newState === 'streaming',
          reconnecting: newState === 'reconnecting',
        }));
      });
    }
  }, [sessionId, cwd]);
  
  /**
   * Push event to pipeline
   */
  const pushEvent = useCallback((event: WsEvent) => {
    eventPipelineRef.current?.push(event);
    
    setState(prev => ({
      ...prev,
      lastEventId: eventPipelineRef.current?.getLastEventId() || prev.lastEventId,
      pendingEvents: eventPipelineRef.current?.flushAll().length || 0,
    }));
  }, []);
  
  /**
   * Connect to SSE
   */
  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    const protocol = location.protocol === 'https:' ? 'https' : 'http';
    const tokenParam = authToken ? `&token=${encodeURIComponent(authToken)}` : '';
    const basePath = location.pathname.startsWith('/pi-web') ? '/pi-web' : '';
    const sseUrl = `${protocol}://${location.host}${basePath}/api/events?cwd=${encodeURIComponent(cwd)}${tokenParam}`;
    
    console.log(`[SyncContext] Connecting to SSE: ${sseUrl}`);
    
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;
    
    eventSource.onopen = () => {
      console.log(`[SyncContext] SSE connected`);
      setState(prev => ({ ...prev, connected: true, reconnecting: false }));
      onConnectedRef.current?.();
      
      // Cancel any pending retry
      retrySchedulerRef.current?.cancel();
      setState(prev => ({ ...prev, retryState: null }));
    };
    
    eventSource.onerror = (e) => {
      console.error(`[SyncContext] SSE error:`, e);
      setState(prev => ({ ...prev, connected: false }));
      onDisconnectedRef.current?.();
      
      // Start reconnection with retry scheduler
      scheduleReconnect();
    };
    
    // Register event handlers
    const eventTypes = [
      'server.connected', 'state', 'model_info',
      'thinking_start', 'thinking_delta', 'thinking_end',
      'text_start', 'text_delta', 'text_end',
      'toolcall_start', 'toolcall_delta', 'toolcall_end',
      'tool_exec_start', 'tool_exec_update', 'tool_exec_end',
      'agent_start', 'agent_end', 'done',
      'turn_start', 'turn_end', 'message_start', 'message_end',
      'compaction_start', 'compaction_end',
      'auto_retry_start', 'auto_retry_end',
      'queue_update', 'error', 'rpc_error', 'rpc_info', 'rpc_response',
      'session_created', 'session_loaded', 'session_switched', 'session_forked',
    ];
    
    for (const eventType of eventTypes) {
      eventSource.addEventListener(eventType, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          const event = data as WsEvent;
          
          // Process through state machine if we have an active session
          const currentSessionId = state.sessionId;
          if (currentSessionId) {
            const activeSession = sessionManagerRef.current.get(currentSessionId);
            activeSession?.stateMachine.processEvent(event);
          }
          
          // Push to pipeline
          pushEvent(event);
        } catch (err) {
          console.error(`[SyncContext] Failed to parse event ${eventType}:`, err);
        }
      });
    }
  }, [cwd, authToken, state.sessionId, pushEvent]);
  
  /**
   * Schedule reconnection with exponential backoff
   */
  const scheduleReconnect = useCallback((errorMessage?: string) => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // Create retry scheduler
    retrySchedulerRef.current = errorMessage 
      ? createRetrySchedulerForError(errorMessage)
      : new RetryScheduler();
    
    retrySchedulerRef.current.setCallbacks(
      (retryState) => {
        console.log(`[SyncContext] Retrying connection (attempt ${retryState.attempt})`);
        connect();
      },
      () => {
        console.error(`[SyncContext] Max retry attempts exhausted`);
        setState(prev => ({ ...prev, retryState: null, reconnecting: false }));
      }
    );
    
    setState(prev => ({ ...prev, reconnecting: true }));
    retrySchedulerRef.current.schedule();
  }, [connect]);
  
  /**
   * Reconnect now (user-initiated)
   */
  const reconnect = useCallback(() => {
    console.log(`[SyncContext] User-initiated reconnect`);
    retrySchedulerRef.current?.stop();
    retrySchedulerRef.current = null;
    setState(prev => ({ ...prev, retryState: null, reconnecting: true }));
    connect();
  }, [connect]);
  
  /**
   * Disconnect
   */
  const disconnect = useCallback(() => {
    console.log(`[SyncContext] Disconnecting`);
    
    retrySchedulerRef.current?.stop();
    retrySchedulerRef.current = null;
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    eventPipelineRef.current?.clear();
    sessionManagerRef.current.clear();
    
    setState(prev => ({
      ...defaultState,
      sessionId: null,
    }));
    
    onDisconnectedRef.current?.();
  }, []);
  
  /**
   * Set active session
   */
  const setActiveSession = useCallback((newSessionId: string | null) => {
    if (newSessionId) {
      sessionManagerRef.current.getOrCreate(newSessionId, cwd);
      setState(prev => ({ ...prev, sessionId: newSessionId }));
    } else {
      if (state.sessionId) {
        sessionManagerRef.current.remove(state.sessionId);
      }
      setState(prev => ({ ...prev, sessionId: null, isWorking: false }));
    }
  }, [cwd, state.sessionId]);
  
  /**
   * Cancel retry
   */
  const cancelRetry = useCallback(() => {
    retrySchedulerRef.current?.cancel();
    setState(prev => ({ ...prev, retryState: null, reconnecting: false }));
  }, []);
  
  /**
   * Retry now
   */
  const retryNow = useCallback(() => {
    retrySchedulerRef.current?.cancel();
    setState(prev => ({ ...prev, retryState: null }));
    connect();
  }, [connect]);
  
  // Connect on mount and CWD change
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);
  
  // Context value
  const value: SyncContextType = {
    ...state,
    pushEvent,
    reconnect,
    disconnect,
    setActiveSession,
    cancelRetry,
    retryNow,
  };
  
  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

// ── Hook ──
export function useSyncContext(): SyncContextType {
  return useContext(SyncContext);
}

// ── Export ──
export { EventPipeline } from './event-pipeline';
export { RetryScheduler } from './retry';
export { SessionStateMachine, ActiveSessionManager } from './session-state';
