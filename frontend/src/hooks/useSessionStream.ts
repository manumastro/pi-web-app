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

  useEffect(() => {
    callbacksRef.current = { onPayload, onConnected, onConnectionLost };
  }, [onPayload, onConnected, onConnectionLost]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const source = new EventSource(`/api/events?sessionId=${encodeURIComponent(sessionId)}`);

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
      if (event instanceof MessageEvent && typeof event.data === 'string') {
        const payload = parsePayload(event.data);
        if (payload && payload.sessionId === sessionId) {
          callbacksRef.current.onPayload(payload);
          return;
        }
      }

      callbacksRef.current.onConnectionLost?.();
    };

    return () => {
      source.close();
    };
  }, [sessionId]);
}
