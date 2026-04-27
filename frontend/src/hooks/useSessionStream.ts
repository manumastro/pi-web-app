import { useEffect, useRef } from 'react';
import type { SsePayload } from '../sync/conversation';
import { coalesceSsePayloads, createSeenEventIdWindow } from '../sync/event-coalescing';

interface UseSessionStreamOptions {
  sessionId: string | undefined;
  onPayload: (payload: SsePayload) => void;
  onPayloadBatch?: (payloads: SsePayload[]) => void;
  onConnected?: () => void;
  onConnectionLost?: () => void;
  onGapDetected?: (detail: { sessionId: string; lastEventId: string; nextEventId: string }) => void;
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
  onGapDetected,
}: UseSessionStreamOptions): void {
  const callbacksRef = useRef({ onPayload, onPayloadBatch, onConnected, onConnectionLost, onGapDetected });
  const reconnectTimerRef = useRef<number | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const queuedPayloadsRef = useRef<SsePayload[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const generationRef = useRef(0);
  const lastEventIdRef = useRef('');
  const lastPayloadAtRef = useRef(0);
  const seenEventIdsRef = useRef(createSeenEventIdWindow());
  const staleTimerRef = useRef<number | null>(null);
  const lastNumericEventIdRef = useRef<number | null>(null);

  useEffect(() => {
    callbacksRef.current = { onPayload, onPayloadBatch, onConnected, onConnectionLost, onGapDetected };
  }, [onPayload, onPayloadBatch, onConnected, onConnectionLost, onGapDetected]);

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

      const batch = coalesceSsePayloads(queuedPayloadsRef.current, seenEventIdsRef.current);
      queuedPayloadsRef.current = [];
      if (batch.length === 0) {
        return;
      }
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
    if (staleTimerRef.current !== null) {
      window.clearInterval(staleTimerRef.current);
      staleTimerRef.current = null;
    }
    queuedPayloadsRef.current = [];
    lastEventIdRef.current = '';
    lastPayloadAtRef.current = 0;
    seenEventIdsRef.current = createSeenEventIdWindow();
    lastNumericEventIdRef.current = null;

    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    if (!sessionId) {
      return;
    }

    const openSource = () => {
      if (generationRef.current !== generation) {
        return;
      }

      if (staleTimerRef.current !== null) {
        window.clearInterval(staleTimerRef.current);
        staleTimerRef.current = null;
      }

      const params = new URLSearchParams({ sessionId });
      if (lastEventIdRef.current) {
        params.set('lastEventId', lastEventIdRef.current);
      }
      const source = new EventSource(`/api/events?${params.toString()}`);
      eventSourceRef.current = source;

      source.onopen = () => {
        lastPayloadAtRef.current = Date.now();
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

        lastPayloadAtRef.current = Date.now();
        if (event.lastEventId) {
          const previousId = lastNumericEventIdRef.current;
          const currentId = Number.parseInt(event.lastEventId, 10);
          if (Number.isFinite(currentId)) {
            if (previousId !== null && currentId > previousId + 1) {
              callbacksRef.current.onGapDetected?.({
                sessionId,
                lastEventId: String(previousId),
                nextEventId: event.lastEventId,
              });
            }
            lastNumericEventIdRef.current = currentId;
          }
          lastEventIdRef.current = event.lastEventId;
          payload.__eventId = event.lastEventId;
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

      staleTimerRef.current = window.setInterval(() => {
        if (generationRef.current !== generation || eventSourceRef.current !== source) {
          return;
        }
        if (lastPayloadAtRef.current > 0 && Date.now() - lastPayloadAtRef.current > 60_000) {
          callbacksRef.current.onConnectionLost?.();
          source.close();
          eventSourceRef.current = null;
          if (staleTimerRef.current !== null) {
            window.clearInterval(staleTimerRef.current);
            staleTimerRef.current = null;
          }
          if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current);
          }
          reconnectTimerRef.current = window.setTimeout(() => {
            if (generationRef.current === generation) {
              openSource();
            }
          }, 1000);
        }
      }, 15_000);

      source.onerror = (event) => {
        if (generationRef.current !== generation) {
          return;
        }

        if (event instanceof MessageEvent && typeof event.data === 'string') {
          const payload = parsePayload(event.data);
          if (payload && payload.sessionId === sessionId) {
            lastPayloadAtRef.current = Date.now();
            if (event.lastEventId) {
              lastEventIdRef.current = event.lastEventId;
              payload.__eventId = event.lastEventId;
            }
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
      if (staleTimerRef.current !== null) {
        window.clearInterval(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      queuedPayloadsRef.current = [];
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [sessionId]);
}
