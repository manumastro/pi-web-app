import { useEffect, useRef } from 'react';
import type { SsePayload } from '../chatState';

interface UseSessionStreamOptions {
  sessionId: string | undefined;
  onPayload: (payload: SsePayload) => void;
  onConnected?: () => void;
  onConnectionLost?: () => void;
}

function parsePayload(data: string): SsePayload | undefined {
  try {
    return JSON.parse(data) as SsePayload;
  } catch {
    return undefined;
  }
}

export function useSessionStream({
  sessionId,
  onPayload,
  onConnected,
  onConnectionLost,
}: UseSessionStreamOptions): void {
  const callbacksRef = useRef({ onPayload, onConnected, onConnectionLost });
  const reconnectTimerRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    callbacksRef.current = { onPayload, onConnected, onConnectionLost };
  }, [onPayload, onConnected, onConnectionLost]);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    if (!sessionId) {
      return;
    }

    const openSource = () => {
      if (generationRef.current !== generation) {
        return;
      }

      const source = new EventSource(`/api/events?sessionId=${encodeURIComponent(sessionId)}`);
      eventSourceRef.current = source;

      source.onopen = () => {
        callbacksRef.current.onConnected?.();
      };

      const handlePayload = (event: Event): void => {
        if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
          return;
        }

        const payload = parsePayload(event.data);
        if (!payload || payload.sessionId !== sessionId) {
          return;
        }

        callbacksRef.current.onPayload(payload);
      };

      source.addEventListener('text_chunk', handlePayload);
      source.addEventListener('thinking', handlePayload);
      source.addEventListener('question', handlePayload);
      source.addEventListener('permission', handlePayload);
      source.addEventListener('tool_call', handlePayload);
      source.addEventListener('tool_result', handlePayload);
      source.addEventListener('done', handlePayload);
      source.addEventListener('error', handlePayload);

      source.onerror = (event) => {
        if (generationRef.current !== generation) {
          return;
        }

        if (event instanceof MessageEvent && typeof event.data === 'string') {
          const payload = parsePayload(event.data);
          if (payload && payload.sessionId === sessionId) {
            callbacksRef.current.onPayload(payload);
            return;
          }
        }

        callbacksRef.current.onConnectionLost?.();
        source.close();
        eventSourceRef.current = null;

        reconnectTimerRef.current = window.setTimeout(() => {
          if (generationRef.current === generation) {
            openSource();
          }
        }, 3000);
      };
    };

    openSource();

    return () => {
      generationRef.current += 1;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [sessionId]);
}
