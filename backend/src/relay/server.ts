import type { Server } from 'node:http';
import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';
import type { SessionStore } from '../sessions/store.js';
import type { SseManager } from '../sse/manager.js';
import { parseRelayViewerMessage, serializeRelayEvent, type RelayEvent, type RelayViewerCommand } from './protocol.js';

interface ViewerConnection {
  id: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  alive: boolean;
}

export interface RelayServerHandle {
  close: () => Promise<void>;
  viewerCount: () => number;
  sessionViewerCounts: () => Record<string, number>;
}

function now(): string {
  return new Date().toISOString();
}

export function installRelayServer(params: {
  server: Server;
  orchestrator: RunnerOrchestrator;
  sessionStore: SessionStore;
  sseManager: SseManager;
  path?: string;
}): RelayServerHandle {
  const { server, orchestrator, sessionStore, sseManager } = params;
  const relayPath = params.path ?? '/api/relay';
  const wss = new WebSocketServer({ noServer: true });
  const viewers = new Map<string, ViewerConnection>();

  function send(viewer: ViewerConnection, event: RelayEvent): void {
    if (viewer.socket.readyState === WebSocket.OPEN) viewer.socket.send(serializeRelayEvent(event));
  }

  function sessionViewerCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const viewer of viewers.values()) {
      for (const sessionId of viewer.subscriptions) counts[sessionId] = (counts[sessionId] ?? 0) + 1;
    }
    return counts;
  }

  function broadcastPresence(): void {
    const event: RelayEvent = {
      type: 'presence',
      viewers: viewers.size,
      sessions: sessionViewerCounts(),
      runner: { status: 'local-child-process' },
    };
    for (const viewer of viewers.values()) send(viewer, event);
  }

  function commandResult(requestId: string | undefined, ok: boolean, data?: unknown, error?: string): RelayEvent {
    return {
      type: 'command_result',
      ...(requestId !== undefined ? { requestId } : {}),
      ok,
      ...(data !== undefined ? { data } : {}),
      ...(error !== undefined ? { error } : {}),
    };
  }

  async function handleCommand(viewer: ViewerConnection, command: RelayViewerCommand): Promise<void> {
    switch (command.type) {
      case 'subscribe': {
        viewer.subscriptions.add(command.sessionId);
        send(viewer, { type: 'subscribed', sessionId: command.sessionId });
        send(viewer, commandResult(command.requestId, true, { session: sessionStore.getSession(command.sessionId) ?? null }));
        broadcastPresence();
        return;
      }
      case 'unsubscribe': {
        viewer.subscriptions.delete(command.sessionId);
        send(viewer, { type: 'unsubscribed', sessionId: command.sessionId });
        send(viewer, commandResult(command.requestId, true));
        broadcastPresence();
        return;
      }
      case 'list_models': {
        const models = await orchestrator.listModels(command.selectedModelKey);
        send(viewer, commandResult(command.requestId, true, { models }));
        return;
      }
      case 'prompt': {
        const result = await orchestrator.prompt({
          ...(command.sessionId !== undefined ? { sessionId: command.sessionId } : {}),
          ...(command.cwd !== undefined ? { cwd: command.cwd } : {}),
          message: command.message,
          ...(command.model !== undefined ? { model: command.model } : {}),
          ...(command.messageId !== undefined ? { messageId: command.messageId } : {}),
          ...(command.thinkingLevel !== undefined ? { thinkingLevel: command.thinkingLevel } : {}),
        });
        viewer.subscriptions.add(result.sessionId);
        send(viewer, commandResult(command.requestId, true, result));
        broadcastPresence();
        return;
      }
      case 'abort':
        await orchestrator.abort(command.sessionId);
        send(viewer, commandResult(command.requestId, true));
        return;
      case 'set_model':
        await orchestrator.setModel(command.sessionId, command.modelKey);
        send(viewer, commandResult(command.requestId, true, { session: sessionStore.getSession(command.sessionId) ?? null }));
        return;
      case 'set_thinking_level':
        await orchestrator.setThinkingLevel(command.sessionId, command.thinkingLevel);
        send(viewer, commandResult(command.requestId, true, { session: sessionStore.getSession(command.sessionId) ?? null }));
        return;
      case 'get_thinking_levels': {
        const levels = await orchestrator.getThinkingLevels(command.sessionId);
        send(viewer, commandResult(command.requestId, true, levels));
        return;
      }
      case 'ping':
        send(viewer, { type: 'pong', ...(command.requestId !== undefined ? { requestId: command.requestId } : {}), serverTime: now() });
        return;
    }
  }

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== relayPath) return;
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (socket) => {
    const viewer: ViewerConnection = { id: crypto.randomUUID(), socket, subscriptions: new Set(), alive: true };
    viewers.set(viewer.id, viewer);
    send(viewer, { type: 'hello', viewerId: viewer.id, serverTime: now(), transport: 'websocket', protocolVersion: 1 });
    broadcastPresence();

    socket.on('pong', () => {
      viewer.alive = true;
    });

    socket.on('message', async (data) => {
      let command: RelayViewerCommand;
      try {
        command = parseRelayViewerMessage(String(data));
      } catch (cause) {
        send(viewer, { type: 'error', message: cause instanceof Error ? cause.message : String(cause), recoverable: true });
        return;
      }
      try {
        await handleCommand(viewer, command);
      } catch (cause) {
        send(viewer, {
          type: 'error',
          ...(command.requestId !== undefined ? { requestId: command.requestId } : {}),
          message: cause instanceof Error ? cause.message : String(cause),
          recoverable: true,
        });
        send(viewer, commandResult(command.requestId, false, undefined, cause instanceof Error ? cause.message : String(cause)));
      }
    });

    socket.on('close', () => {
      viewers.delete(viewer.id);
      broadcastPresence();
    });
  });

  const unobserve = sseManager.observe((event) => {
    for (const viewer of viewers.values()) {
      if (viewer.subscriptions.has(event.sessionId)) send(viewer, { type: 'sse_event', event });
    }
  });

  const heartbeat = setInterval(() => {
    for (const viewer of viewers.values()) {
      if (!viewer.alive) {
        viewer.socket.terminate();
        viewers.delete(viewer.id);
        continue;
      }
      viewer.alive = false;
      viewer.socket.ping();
    }
  }, 30_000);
  heartbeat.unref();

  return {
    close: async () => {
      clearInterval(heartbeat);
      unobserve();
      for (const viewer of viewers.values()) viewer.socket.terminate();
      viewers.clear();
      wss.close();
    },
    viewerCount: () => viewers.size,
    sessionViewerCounts,
  };
}
