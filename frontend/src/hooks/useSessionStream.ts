import { useEffect, useRef } from 'react';
import type { SsePayload } from '../sync/conversation';

interface UseSessionStreamOptions {
  sessionId: string | undefined;
  onPayload: (payload: SsePayload) => void;
  onPayloadBatch?: (payloads: SsePayload[]) => void;
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
  onPayloadBatch,
  onConnected,
  onConnectionLost,
}: UseSessionStreamOptions): void {
  const callbacksRef = useRef({ onPayload, onPayloadBatch, onConnected, onConnectionLost });
  const reconnectTimerRef = useRef<number | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const queuedPayloadsRef = useRef<SsePayload[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    callbacksRef.current = { onPayload, onPayloadBatch, onConnected, onConnectionLost };
  }, [onPayload, onPayloadBatch, onConnected, onConnectionLost]);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;

    const flushQueuedPayloads = () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      if (queuedPayloadsRef.current.length === 0) {
        return;
      }

      const batch = queuedPayloadsRef.current;
      queuedPayloadsRef.current = [];
      if (callbacksRef.current.onPayloadBatch) {
        callbacksRef.current.onPayloadBatch(batch);
        return;
      }
      batch.forEach((payload) => callbacksRef.current.onPayload(payload));
    };

    const enqueuePayload = (payload: SsePayload) => {
      queuedPayloadsRef.current.push(payload);
      if (flushTimerRef.current !== null) {
        return;
      }
      flushTimerRef.current = window.setTimeout(() => {
        flushQueuedPayloads();
      }, 16);
    };

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    queuedPayloadsRef.current = [];

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

        enqueuePayload(payload);
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
            enqueuePayload(payload);
            flushQueuedPayloads();
            return;
          }
        }

        flushQueuedPayloads();
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
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      queuedPayloadsRef.current = [];
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [sessionId]);
}
