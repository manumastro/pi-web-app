import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiRoutes } from './install.js';
import { createSessionStore } from '../../sessions/store.js';
import type { RunnerOrchestrator } from '../../runner/orchestrator.js';
import type { SseEvent } from '../../events.js';
import type { SseManager } from '../../sse/manager.js';

function createMockSseManager(): SseManager {
  const observers = new Set<(event: SseEvent) => void>();
  return {
    subscribe: () => ({ id: 'c', sessionId: 's', response: {} as never }),
    unsubscribe: () => undefined,
    broadcast: (event) => {
      for (const observer of observers) observer(event);
    },
    broadcastToSession: (_sessionId, event) => {
      for (const observer of observers) observer(event);
    },
    observe: (listener) => {
      observers.add(listener);
      return () => observers.delete(listener);
    },
    clientCount: () => 0,
  };
}

describe('installApiRoutes', () => {
  const sessionStore = createSessionStore();
  const prompt = vi.fn(async () => ({ sessionId: 'session-1', assistantMessage: 'ok' }));
  const listModels = vi.fn(async () => [{
    key: 'demo/model-a',
    provider: 'demo',
    id: 'model-a',
    name: 'Model A',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1000,
    maxTokens: 500,
    available: true,
    authConfigured: true,
    isSelected: false,
  }]);

  const runner: RunnerOrchestrator = {
    listModels,
    prompt,
    abort: vi.fn(async () => undefined),
    answerQuestion: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    setThinkingLevel: vi.fn(async () => undefined),
    getThinkingLevels: vi.fn(async () => ({ currentLevel: undefined, availableLevels: ['minimal', 'low', 'medium', 'high'] })),
    dispose: vi.fn(async () => undefined),
  };

  const config = {
    port: 0,
    nodeEnv: 'test' as const,
    homeDir: '/tmp',
    sessionsDir: '/tmp/sessions',
    piCwd: '/tmp',
    model: undefined,
    corsOrigins: [],
    logLevel: 'error' as const,
    allowSystemdRestart: false,
    systemdServiceName: 'pi-web',
    restartStrategy: 'disabled' as const,
    sessionIdPrefix: 'session',
    generateSessionId: () => 'generated',
  };

  let server: ReturnType<express.Application['listen']> | undefined;
  let baseUrl = '';

  beforeEach(() => {
    sessionStore.clearAll();
    prompt.mockClear();
    listModels.mockClear();

    const app = express();
    app.use(express.json());
    installApiRoutes(app, {
      runner,
      sessionStore,
      sseManager: createMockSseManager(),
      config,
    });

    server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  });

  it('supports session CRUD and status map', async () => {
    const createResp = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: '/tmp/project', title: 'My Session' }),
    });
    expect(createResp.status).toBe(200);
    const created = await createResp.json() as { id: string; title: string; directory: string };
    expect(created.title).toBe('My Session');

    const listResp = await fetch(`${baseUrl}/session?directory=${encodeURIComponent('/tmp/project')}`);
    const list = await listResp.json() as Array<{ id: string }>;
    expect(list.some((session) => session.id === created.id)).toBe(true);

    const statusResp = await fetch(`${baseUrl}/session/status`);
    const statusMap = await statusResp.json() as Record<string, { type: string }>;
    expect(statusMap[created.id]?.type).toBe('idle');

    const updateResp = await fetch(`${baseUrl}/session/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed' }),
    });
    expect(updateResp.status).toBe(200);

    const deleteResp = await fetch(`${baseUrl}/session/${created.id}`, { method: 'DELETE' });
    expect(deleteResp.status).toBe(200);
  });

  it('supports prompt_async contract', async () => {
    const session = sessionStore.createSession('/tmp/project', 'demo/model-a', 'session-1');
    expect(session.id).toBe('session-1');

    const resp = await fetch(`${baseUrl}/session/session-1/prompt_async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: 'hello' }],
        model: { providerID: 'demo', modelID: 'model-a' },
      }),
    });

    expect(resp.status).toBe(204);
    expect(prompt).toHaveBeenCalledTimes(1);
    const called = prompt.mock.calls[0]?.[0] as { message: string; displayMessage: string; model: string };
    expect(called.displayMessage).toBe('hello');
    expect(called.model).toBe('demo/model-a');
  });

  it('returns provider and model payloads as arrays', async () => {
    const providersResp = await fetch(`${baseUrl}/provider`);
    const providers = await providersResp.json() as { all: Array<{ models: unknown[] }> };
    expect(Array.isArray(providers.all)).toBe(true);
    expect(Array.isArray(providers.all[0]?.models)).toBe(true);

    const configProvidersResp = await fetch(`${baseUrl}/config/providers`);
    const configProviders = await configProvidersResp.json() as { providers: Array<{ models: unknown[] }> };
    expect(Array.isArray(configProviders.providers[0]?.models)).toBe(true);

    const modelsResp = await fetch(`${baseUrl}/models`);
    const models = await modelsResp.json() as { models: Array<{ id: string }> };
    expect(models.models[0]?.id).toBe('demo/model-a');
  });

  it('serves filesystem, git and misc endpoints', async () => {
    const fsHomeResp = await fetch(`${baseUrl}/fs/home`);
    expect(fsHomeResp.status).toBe(200);

    const gitResp = await fetch(`${baseUrl}/git/worktrees/bootstrap-status?directory=${encodeURIComponent('/tmp/project')}`);
    const git = await gitResp.json() as { bootstrapped: boolean; directory: string };
    expect(git.bootstrapped).toBe(false);
    expect(git.directory).toBe('/tmp/project');

    const wsResp = await fetch(`${baseUrl}/global/event/ws`);
    expect(wsResp.status).toBe(426);

    const metadataResp = await fetch(`${baseUrl}/openchamber/models-metadata`);
    expect(metadataResp.status).toBe(200);
  });
});
