import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { registerApiRoutes } from './index.js';
import { createSessionStore } from '../sessions/store.js';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';

async function withServer(bridge: RunnerOrchestrator, test: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerApiRoutes(app, {
    bridge,
    sessionStore: createSessionStore(),
    config: {
      port: 0,
      nodeEnv: 'test',
      homeDir: '/tmp',
      sessionsDir: '/tmp/pi-web-route-test/sessions',
      sdkCwd: '/tmp',
      model: 'p/a',
      corsOrigins: [],
      logLevel: 'error',
      sessionIdPrefix: 'test',
      generateSessionId: () => 'id-1',
    },
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not listen on a TCP port');
  try {
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((cause) => cause ? reject(cause) : resolve()));
  }
}

describe('runner-backed API routes', () => {
  const disposables: RunnerOrchestrator[] = [];

  afterEach(async () => {
    await Promise.all(disposables.map((bridge) => bridge.dispose().catch(() => undefined)));
    disposables.length = 0;
  });

  function fakeBridge(overrides: Partial<RunnerOrchestrator> = {}): RunnerOrchestrator {
    const bridge: RunnerOrchestrator = {
      listModels: async () => [{
        key: 'p/a',
        id: 'a',
        provider: 'p',
        name: 'A',
        available: true,
        authConfigured: true,
        reasoning: false,
        input: ['text'],
        contextWindow: 128000,
        maxTokens: 16384,
        isSelected: true,
      }],
      prompt: async () => ({ sessionId: 'session-1', assistantMessage: '' }),
      abort: async () => undefined,
      setModel: async () => undefined,
      setThinkingLevel: async () => undefined,
      getThinkingLevels: async () => ({ currentLevel: 'medium', availableLevels: ['minimal', 'low', 'medium', 'high', 'xhigh'] }),
      dispose: async () => undefined,
      ...overrides,
    };
    disposables.push(bridge);
    return bridge;
  }

  it('returns runner model failures as JSON 503 responses', async () => {
    await withServer(fakeBridge({ listModels: async () => { throw new Error('runner unavailable'); } }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/models`);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual({ error: 'runner unavailable' });
    });
  });

  it('returns runner abort failures as JSON 503 responses', async () => {
    await withServer(fakeBridge({ abort: async () => { throw new Error('runner exited'); } }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/messages/abort`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session-1' }),
      });
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual({ error: 'runner exited' });
    });
  });
});
