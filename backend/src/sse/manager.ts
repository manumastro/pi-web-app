import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { SseEvent } from '../sdk/events.js';
import { appendSseHistorySync, loadSseHistoriesSync } from './history.js';

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
  observe: (listener: (event: SseEvent) => void) => () => void;
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

export function createSseManager(historyDir?: string): SseManager {
  const clients = new Map<string, SseClient>();
  const histories = historyDir ? loadSseHistoriesSync(historyDir) : new Map<string, StoredEvent[]>();
  const counters = new Map<string, number>();
  const observers = new Set<(event: SseEvent) => void>();

  for (const [sessionId, history] of histories.entries()) {
    const last = history.at(-1);
    if (last) {
      counters.set(sessionId, last.id);
    }
  }

  function nextEventId(sessionId: string): number {
    const next = (counters.get(sessionId) ?? 0) + 1;
    counters.set(sessionId, next);
    return next;
  }

  function recordEvent(sessionId: string, event: SseEvent): number {
    const id = nextEventId(sessionId);
    const history = histories.get(sessionId) ?? [];
    const stored = { id, event };
    history.push(stored);
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }
    histories.set(sessionId, history);

    if (historyDir) {
      appendSseHistorySync(historyDir, stored);
    }

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
      for (const observer of observers) observer(event);
      for (const client of clients.values()) {
        if (client.sessionId === event.sessionId) {
          sendToClient(client, id, event);
        }
      }
    },

    broadcastToSession(sessionId: string, event: SseEvent): void {
      const normalized = { ...event, sessionId };
      const id = recordEvent(sessionId, normalized);
      for (const observer of observers) observer(normalized);
      for (const client of clients.values()) {
        if (client.sessionId === sessionId) {
          sendToClient(client, id, normalized);
        }
      }
    },

    observe(listener: (event: SseEvent) => void): () => void {
      observers.add(listener);
      return () => observers.delete(listener);
    },

    clientCount(): number {
      return clients.size;
    },
  };
}
