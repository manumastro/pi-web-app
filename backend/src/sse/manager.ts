import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { SseEvent } from '../sdk/events.js';

export interface SseClient {
  id: string;
  sessionId: string;
  response: ServerResponse;
}

export interface SseManager {
  subscribe: (sessionId: string, response: ServerResponse) => SseClient;
  unsubscribe: (clientId: string) => void;
  broadcast: (event: SseEvent) => void;
  broadcastToSession: (sessionId: string, event: SseEvent) => void;
  clientCount: () => number;
}

function writeEvent(response: ServerResponse, event: SseEvent): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function createSseManager(): SseManager {
  const clients = new Map<string, SseClient>();

  return {
    subscribe(sessionId: string, response: ServerResponse): SseClient {
      const client: SseClient = {
        id: randomUUID(),
        sessionId,
        response,
      };

      clients.set(client.id, client);
      response.write(': connected\n\n');
      response.write('retry: 3000\n\n');
      return client;
    },

    unsubscribe(clientId: string): void {
      clients.delete(clientId);
    },

    broadcast(event: SseEvent): void {
      for (const client of clients.values()) {
        if (client.sessionId === event.sessionId) {
          writeEvent(client.response, event);
        }
      }
    },

    broadcastToSession(sessionId: string, event: SseEvent): void {
      for (const client of clients.values()) {
        if (client.sessionId === sessionId) {
          writeEvent(client.response, event);
        }
      }
    },

    clientCount(): number {
      return clients.size;
    },
  };
}
