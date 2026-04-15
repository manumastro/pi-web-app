// ── SSE Hook for Frontend ──
// Replace WebSocket with EventSource (SSE)
// Follows OpenCode Web UI pattern

import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsEvent, WsCommand } from '../types';

export interface UseSSEOptions {
  cwd: string;
  onEvent: (event: WsEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  authToken?: string;
}

export function useSSE({ cwd, onEvent, onConnected, onDisconnected, authToken }: UseSSEOptions) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);

  // Keep refs updated
  onEventRef.current = onEvent;
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;

  const connect = useCallback(() => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const protocol = location.protocol === 'https:' ? 'https' : 'http';
    const tokenParam = authToken ? `&token=${encodeURIComponent(authToken)}` : '';
    
    // Detect base path (e.g., /pi-web/)
    const basePath = location.pathname.startsWith('/pi-web') ? '/pi-web' : '';
    const sseUrl = `${protocol}://${location.host}${basePath}/api/events?cwd=${encodeURIComponent(cwd)}${tokenParam}`;

    console.log(`📡 Connecting to SSE: ${sseUrl}`);

    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    // Connection opened
    eventSource.onopen = () => {
      console.log('📡 SSE connected');
      setConnected(true);
      onConnectedRef.current?.();
    };

    // Handle errors
    eventSource.onerror = (e) => {
      console.error('📡 SSE error:', e);
      setConnected(false);
      onDisconnectedRef.current?.();

      // EventSource auto-reconnects, but we can customize if needed
      eventSource.close();
      
      // Manual reconnect after 3 seconds
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('📡 SSE reconnecting...');
        connect();
      }, 3000);
    };

    // Default message handler
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current({ type: 'server_log', level: 'info', message: e.data });
      } catch {
        // Not JSON, ignore
      }
    };

    // Register event type handlers
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
          const data = JSON.parse(e.data);
          onEventRef.current(data);
        } catch (err) {
          console.error(`📡 Failed to parse event ${eventType}:`, err);
        }
      });
    }
  }, [cwd, authToken]);

  // Send command via REST API (SSE is receive-only)
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
            console.warn('Failed to fetch available models', response.status);
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
          if (!response.ok) {
            console.warn('Failed to fetch session state', response.status);
            return;
          }
          const state = await response.json();
          onEventRef.current({ type: 'state', ...state });
          return;
        }
        case 'get_session_stats': {
          const response = await fetch(`${baseUrl}/api/sessions/stats?cwd=${encodeURIComponent(targetCwd)}`);
          if (!response.ok) {
            console.warn('Failed to fetch session stats', response.status);
            return;
          }
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
          if (!response.ok) {
            console.warn('Failed to load session', response.status);
            return null;
          }
          return response.json();
        }
        case 'new_session': {
          const response = await fetch(`${baseUrl}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: targetCwd }),
          });
          if (!response.ok) {
            console.warn('Failed to create new session', response.status);
            return null;
          }
          return response.json();
        }
        case 'set_model': {
          const response = await fetch(`${baseUrl}/api/sessions/model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: cmd.provider, modelId: cmd.modelId, cwd: targetCwd }),
          });
          if (!response.ok) {
            console.warn('Failed to set model', response.status);
          }
          return;
        }
        case 'report_visibility': {
          // Visibility reporting is not supported over SSE send; no-op here.
          return;
        }
        default:
          console.warn('Unknown command type:', cmd.type);
      }
    } catch (err) {
      console.error('SSE send error:', err);
      throw err;
    }
  }, [cwd]);

  // Connect on mount and CWD change
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      eventSourceRef.current?.close();
    };
  }, [connect]);

  return { connected, send, reconnect: connect };
}