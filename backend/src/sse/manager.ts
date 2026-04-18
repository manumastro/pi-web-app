import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { SseEvent } from '../sdk/events.js';

export interface SseClient {
  id: string;
  sessionId: string;
  response: ServerResponse;
}

export interface SseManager {
  subscribe: (sessionId: string, response: ServerResponse, lastEventId?: string) => SseClient;
  unsubscribe: (clientId: string) => void;
  broadcast: (event: SseEvent) => void;
  broadcastToSession: (sessionId: string, event: SseEvent) => void;
  clientCount: () => number;
}

interface StoredEvent {
  id: number;
  event: SseEvent;
}

const MAX_HISTORY = 250;

function writeEvent(response: ServerResponse, id: number, event: SseEvent): void {
  response.write(`id: ${id}\n`);
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function parseLastEventId(lastEventId?: string): number | undefined {
  if (!lastEventId) {
    return undefined;
  }

  const parsed = Number.parseInt(lastEventId, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function createSseManager(): SseManager {
  const clients = new Map<string, SseClient>();
  const histories = new Map<string, StoredEvent[]>();
  const counters = new Map<string, number>();

  function nextEventId(sessionId: string): number {
    const next = (counters.get(sessionId) ?? 0) + 1;
    counters.set(sessionId, next);
    return next;
  }

  function recordEvent(sessionId: string, event: SseEvent): number {
    const id = nextEventId(sessionId);
    const history = histories.get(sessionId) ?? [];
    history.push({ id, event });
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }
    histories.set(sessionId, history);
    return id;
  }

  function replayHistory(sessionId: string, response: ServerResponse, lastEventId?: string): void {
    const since = parseLastEventId(lastEventId);
    if (since === undefined) {
      return;
    }

    const history = histories.get(sessionId) ?? [];
    for (const entry of history) {
      if (entry.id > since) {
        writeEvent(response, entry.id, entry.event);
      }
    }
  }

  function sendToClient(client: SseClient, id: number, event: SseEvent): void {
    writeEvent(client.response, id, event);
  }

  return {
    subscribe(sessionId: string, response: ServerResponse, lastEventId?: string): SseClient {
      const client: SseClient = {
        id: randomUUID(),
        sessionId,
        response,
      };

      clients.set(client.id, client);
      response.write(': connected\n\n');
      response.write('retry: 3000\n\n');
      replayHistory(sessionId, response, lastEventId);
      return client;
    },

    unsubscribe(clientId: string): void {
      clients.delete(clientId);
    },

    broadcast(event: SseEvent): void {
      const id = recordEvent(event.sessionId, event);
      for (const client of clients.values()) {
        if (client.sessionId === event.sessionId) {
          sendToClient(client, id, event);
        }
      }
    },

    broadcastToSession(sessionId: string, event: SseEvent): void {
      const id = recordEvent(sessionId, { ...event, sessionId });
      for (const client of clients.values()) {
        if (client.sessionId === sessionId) {
          sendToClient(client, id, { ...event, sessionId });
        }
      }
    },

    clientCount(): number {
      return clients.size;
    },
  };
}
