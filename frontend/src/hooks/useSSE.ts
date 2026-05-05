/**
 * useSSE — hook minimalista per SSE globale.
 * Filtra eventi per sessionId e notifica via callback.
 */

import { useEffect, useRef, useCallback } from 'react';
import { connectSSE, type SseEvent } from '../lib/api';

interface UseSSEOptions {
  sessionId: string | null;
  onMessageDelta?: (messageID: string, partID: string, text: string) => void;
  onMessageUpdated?: (messageRecord: unknown) => void;
  onSessionStatus?: (status: { type: string }) => void;
}

export function useSSE(opts: UseSSEOptions) {
  const { sessionId, onMessageDelta, onMessageUpdated, onSessionStatus } = opts;
  const sessionIdRef = useRef(sessionId);
  const onDeltaRef = useRef(onMessageDelta);
  const onUpdatedRef = useRef(onMessageUpdated);
  const onStatusRef = useRef(onSessionStatus);

  // Keep refs up to date
  useEffect(() => {
    sessionIdRef.current = sessionId;
    onDeltaRef.current = onMessageDelta;
    onUpdatedRef.current = onMessageUpdated;
    onStatusRef.current = onSessionStatus;
  }, [sessionId, onMessageDelta, onMessageUpdated, onSessionStatus]);

  useEffect(() => {
    const handleEvent = (event: SseEvent) => {
      const sid = sessionIdRef.current;
      if (!sid) return;

      const props = event.properties ?? {};

      // Check if event belongs to our session
      const propsAny = props as Record<string, unknown>;
      const eventSessionId: string | undefined =
        (propsAny.sessionID as string | undefined)
        || (propsAny.info as Record<string, unknown> | undefined)?.sessionID as string | undefined
        || (propsAny.part as Record<string, unknown> | undefined)?.sessionID as string | undefined;

      if (eventSessionId !== sid) return;

      // message.part.delta → streaming text
      if (event.type === 'message.part.delta') {
        const msgId = props.messageID as string | undefined;
        const partId = props.partID as string | undefined;
        const delta = props.delta as string | undefined;
        if (msgId && partId && delta && onDeltaRef.current) {
          onDeltaRef.current(msgId, partId, delta);
        }
      }

      // message.updated or message.part.updated → final message ready
      if (event.type === 'message.updated' || event.type === 'message.part.updated') {
        onUpdatedRef.current?.(event);
      }

      // session.status or session.idle → status changes
      if (event.type === 'session.status' || event.type === 'session.idle') {
        const status = (props.status as Record<string, unknown> | undefined) ?? { type: 'idle' };
        onStatusRef.current?.(status as { type: string });
      }
    };

    const { close } = connectSSE(
      handleEvent,
      (err) => console.warn('[SSE] error', err),
    );

    return () => close();
  }, []); // only connect once
}
