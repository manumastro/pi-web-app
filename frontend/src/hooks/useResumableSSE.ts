// ── Resumable SSE Hook ──
// SSE with event caching and resumption support
// Inspired by OpenChamber's sync/sync-context.tsx

import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsEvent, WsCommand } from '../types';
import { EventBuffer, EventDeduplicator } from '../sync/event-pipeline';
import { RetryScheduler, createRetrySchedulerForError } from '../sync/retry';

export interface ResumableSSEOptions {
  cwd: string;
  onEvent: (event: WsEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onRetryStateChange?: (state: { attempt: number; maxAttempts: number; nextRetryTime: number } | null) => void;
  authToken?: string;
}

export interface ResumableSSEState {
  connected: boolean;
  reconnecting: boolean;
  retryAttempt: number | null;
  retryInfo: { nextRetryTime: number; delayMs: number } | null;
  lastEventId: number;
  pendingEvents: number;
}

const MAX_PENDING_EVENTS = 1000;
const EVENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useResumableSSE({
  cwd,
  onEvent,
  onConnected,
  onDisconnected,
  onRetryStateChange,
  authToken,
}: ResumableSSEOptions) {
  // State
  const [state, setState] = useState<ResumableSSEState>({
    connected: false,
    reconnecting: false,
    retryAttempt: null,
    retryInfo: null,
    lastEventId: 0,
    pendingEvents: 0,
  });

  // Refs for stable access in closures
  const eventSourceRef = useRef<EventSource | null>(null);
  const retrySchedulerRef = useRef<RetryScheduler | null>(null);
  const eventBufferRef = useRef<EventBuffer>(new EventBuffer());
  const deduplicatorRef = useRef<EventDeduplicator>(new EventDeduplicator());
  const pendingEventsRef = useRef<WsEvent[]>([]);
  const eventCacheRef = useRef<Map<number, WsEvent>>(new Map());
  const lastProcessedEventIdRef = useRef<number>(0);
  const onEventRef = useRef(onEvent);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onRetryStateChangeRef = useRef(onRetryStateChange);
  const mountedRef = useRef(true);

  // Keep refs updated
  onEventRef.current = onEvent;
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  onRetryStateChangeRef.current = onRetryStateChange;

  /**
   * Process pending events from buffer
   */
  const processPendingEvents = useCallback(() => {
    const readyEvents = eventBufferRef.current.getReadyEvents();
    
    for (const event of readyEvents) {
      // Process event
      onEventRef.current(event);
      
      // Track last processed event ID
      lastProcessedEventIdRef.current++;
      
      // Cache event for potential resumption
      eventCacheRef.current.set(lastProcessedEventIdRef.current, event);
      
      // Cleanup old cache entries
      if (eventCacheRef.current.size > MAX_PENDING_EVENTS) {
        const cutoff = Date.now() - EVENT_CACHE_TTL;
        for (const [id, event] of eventCacheRef.current.entries()) {
          // Simple cleanup - keep last N events
          if (id < lastProcessedEventIdRef.current - 100) {
            eventCacheRef.current.delete(id);
          }
        }
      }
    }
    
    // Update state
    setState(prev => ({
      ...prev,
      lastEventId: lastProcessedEventIdRef.current,
      pendingEvents: eventBufferRef.current.hasPending() ? 1 : 0,
    }));
  }, []);

  /**
   * Schedule batch processing
   */
  const scheduleProcessEvents = useCallback(() => {
    setTimeout(processPendingEvents, 10);
  }, [processPendingEvents]);

  /**
   * Connect to SSE with resumption support
   */
  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Cancel any pending retry
    retrySchedulerRef.current?.cancel();

    const protocol = location.protocol === 'https:' ? 'https' : 'http';
    const tokenParam = authToken ? `&token=${encodeURIComponent(authToken)}` : '';
    const basePath = location.pathname.startsWith('/pi-web') ? '/pi-web' : '';
    
    // Build URL with Last-Event-ID for resumption
    const lastEventId = lastProcessedEventIdRef.current;
    const sseUrl = `${protocol}://${location.host}${basePath}/api/events?cwd=${encodeURIComponent(cwd)}${tokenParam}${lastEventId > 0 ? `&lastEventId=${lastEventId}` : ''}`;

    console.log(`[ResumableSSE] Connecting: ${sseUrl} (lastEventId: ${lastEventId})`);

    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (!mountedRef.current) return;
      
      console.log(`[ResumableSSE] Connected`);
      setState(prev => ({
        ...prev,
        connected: true,
        reconnecting: false,
        retryAttempt: null,
        retryInfo: null,
      }));
      
      onConnectedRef.current?.();
      
      // Cancel any pending retry
      retrySchedulerRef.current?.cancel();
      onRetryStateChangeRef.current?.(null);
      
      // Process any pending events from buffer
      scheduleProcessEvents();
    };

    eventSource.onerror = (e) => {
      if (!mountedRef.current) return;
      
      console.error(`[ResumableSSE] Error:`, e);
      setState(prev => ({ ...prev, connected: false }));
      onDisconnectedRef.current?.();
      
      eventSource.close();
      
      // Schedule reconnection with exponential backoff
      scheduleReconnect();
    };

    // Handle individual event types
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
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse((e as MessageEvent).data);
          const event = data as WsEvent;
          
          // Check for duplicate
          const eventId = EventDeduplicator.generateEventId(event);
          if (deduplicatorRef.current.isDuplicate(eventId, Date.now())) {
            console.debug(`[ResumableSSE] Duplicate event dropped: ${event.type}`);
            return;
          }
          deduplicatorRef.current.markSeen(eventId, Date.now());
          
          // Add to buffer
          eventBufferRef.current.add(event, cwd);
          
          // Schedule processing
          scheduleProcessEvents();
          
        } catch (err) {
          console.error(`[ResumableSSE] Failed to parse event ${eventType}:`, err);
        }
      });
    }
  }, [cwd, authToken, scheduleProcessEvents]);

  /**
   * Schedule reconnection with exponential backoff
   */
  const scheduleReconnect = useCallback(() => {
    retrySchedulerRef.current?.cancel();
    
    // Use adaptive retry based on error type
    retrySchedulerRef.current = new RetryScheduler({
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      maxAttempts: 5,
      jitterFactor: 0.3,
      backoffMultiplier: 2,
    });
    
    retrySchedulerRef.current.setCallbacks(
      (retryState) => {
        if (!mountedRef.current) return;
        
        console.log(`[ResumableSSE] Reconnecting (attempt ${retryState.attempt})`);
        setState(prev => ({
          ...prev,
          reconnecting: true,
          retryAttempt: retryState.attempt,
          retryInfo: {
            nextRetryTime: retryState.nextRetryTime,
            delayMs: retryState.totalDelayMs,
          },
        }));
        onRetryStateChangeRef.current?.({
          attempt: retryState.attempt,
          maxAttempts: 5,
          nextRetryTime: retryState.nextRetryTime,
        });
        connect();
      },
      () => {
        if (!mountedRef.current) return;
        
        console.error(`[ResumableSSE] Max retry attempts exhausted`);
        setState(prev => ({
          ...prev,
          reconnecting: false,
          retryAttempt: null,
          retryInfo: null,
        }));
        onRetryStateChangeRef.current?.(null);
      }
    );
    
    setState(prev => ({ ...prev, reconnecting: true }));
    retrySchedulerRef.current.schedule();
  }, [connect]);

  /**
   * Force reconnect (user-initiated or after getting new events)
   */
  const reconnect = useCallback(() => {
    console.log(`[ResumableSSE] User-initiated reconnect`);
    retrySchedulerRef.current?.stop();
    retrySchedulerRef.current = null;
    
    setState(prev => ({
      ...prev,
      reconnecting: false,
      retryAttempt: null,
      retryInfo: null,
    }));
    onRetryStateChangeRef.current?.(null);
    
    connect();
  }, [connect]);

  /**
   * Send command via REST API
   */
  const send = useCallback(async (cmd: WsCommand) => {
    const basePath = location.pathname.startsWith('/pi-web') ? '/pi-web' : '';
    const baseUrl = `${location.protocol}//${location.host}${basePath}`;
    const targetCwd = cmd.cwd || cwd;
    
    try {
      switch (cmd.type) {
        case 'prompt': {
          const response = await fetch(`${baseUrl}/api/sessions/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cmd.text, cwd: targetCwd, images: cmd.images }),
          });
          return response;
        }
        case 'steer': {
          await fetch(`${baseUrl}/api/sessions/steer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cmd.text, cwd: targetCwd }),
          });
          return;
        }
        case 'follow_up': {
          await fetch(`${baseUrl}/api/sessions/follow_up`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cmd.text, cwd: targetCwd }),
          });
          return;
        }
        case 'abort': {
          await fetch(`${baseUrl}/api/sessions/abort`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: targetCwd }),
          });
          return;
        }
        case 'get_available_models': {
          const response = await fetch(`${baseUrl}/api/enabled-models`);
          if (!response.ok) {
            onEventRef.current({ type: 'rpc_response', command: 'get_available_models', data: { models: [] } });
            return;
          }
          const json = await response.json();
          const models = Array.isArray(json.models) ? json.models : json;
          onEventRef.current({ type: 'rpc_response', command: 'get_available_models', data: { models } });
          return;
        }
        case 'get_state': {
          const response = await fetch(`${baseUrl}/api/sessions/state?cwd=${encodeURIComponent(targetCwd)}`);
          if (!response.ok) return;
          const state = await response.json();
          onEventRef.current({ type: 'state', ...state });
          return;
        }
        case 'get_session_stats': {
          const response = await fetch(`${baseUrl}/api/sessions/stats?cwd=${encodeURIComponent(targetCwd)}`);
          if (!response.ok) return;
          const stats = await response.json();
          onEventRef.current({ type: 'rpc_response', command: 'get_session_stats', data: stats });
          return;
        }
        case 'load_session': {
          const response = await fetch(`${baseUrl}/api/sessions/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: cmd.sessionId, cwd: targetCwd }),
          });
          if (!response.ok) return null;
          return response.json();
        }
        case 'new_session': {
          const response = await fetch(`${baseUrl}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: targetCwd }),
          });
          if (!response.ok) return null;
          return response.json();
        }
        case 'set_model': {
          const response = await fetch(`${baseUrl}/api/sessions/model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: cmd.provider, modelId: cmd.modelId, cwd: targetCwd }),
          });
          return;
        }
        default:
          console.warn('[ResumableSSE] Unknown command type:', cmd.type);
      }
    } catch (err) {
      console.error('[ResumableSSE] Send error:', err);
      throw err;
    }
  }, [cwd]);

  /**
   * Get pending events count
   */
  const getPendingCount = useCallback(() => {
    return pendingEventsRef.current.length;
  }, []);

  /**
   * Get cached events for resumption
   */
  const getCachedEvents = useCallback(() => {
    return Array.from(eventCacheRef.current.values());
  }, []);

  // Mount effect
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      retrySchedulerRef.current?.cancel();
      eventSourceRef.current?.close();
      eventBufferRef.current.flush();
      deduplicatorRef.current.clear();
    };
  }, [connect]);

  return {
    ...state,
    send,
    reconnect,
    getPendingCount,
    getCachedEvents,
  };
}
