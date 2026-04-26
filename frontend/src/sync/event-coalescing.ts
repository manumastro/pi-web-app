import type { SsePayload } from './conversation';

const MAX_SEEN_EVENT_IDS = 500;

export interface SeenEventIds {
  has: (id: string) => boolean;
  add: (id: string) => void;
}

export function createSeenEventIdWindow(limit = MAX_SEEN_EVENT_IDS): SeenEventIds {
  const order: string[] = [];
  const values = new Set<string>();

  return {
    has: (id) => values.has(id),
    add: (id) => {
      if (values.has(id)) return;
      values.add(id);
      order.push(id);
      while (order.length > limit) {
        const removed = order.shift();
        if (removed) values.delete(removed);
      }
    },
  };
}

export function payloadEventId(payload: SsePayload): string | undefined {
  return typeof payload.__eventId === 'string' && payload.__eventId.length > 0 ? payload.__eventId : undefined;
}

function canMergeTextPayload(left: SsePayload, right: SsePayload): boolean {
  return left.type === 'text_chunk'
    && right.type === 'text_chunk'
    && left.sessionId === right.sessionId
    && (left.messageId ?? '') === (right.messageId ?? '');
}

function mergeTextPayload(left: SsePayload, right: SsePayload): SsePayload {
  return {
    ...right,
    content: `${left.content ?? ''}${right.content ?? ''}`,
    timestamp: right.timestamp ?? left.timestamp,
  };
}

export function coalesceSsePayloads(payloads: SsePayload[], seenEventIds?: SeenEventIds): SsePayload[] {
  const deduped: SsePayload[] = [];

  for (const payload of payloads) {
    const eventId = payloadEventId(payload);
    if (eventId && seenEventIds?.has(eventId)) {
      continue;
    }
    if (eventId) {
      seenEventIds?.add(eventId);
    }
    deduped.push(payload);
  }

  const coalesced: SsePayload[] = [];
  for (const payload of deduped) {
    const previous = coalesced.at(-1);
    if (previous && canMergeTextPayload(previous, payload)) {
      coalesced[coalesced.length - 1] = mergeTextPayload(previous, payload);
    } else {
      coalesced.push(payload);
    }
  }

  return coalesced;
}
