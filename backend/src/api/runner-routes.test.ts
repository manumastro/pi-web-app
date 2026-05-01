import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { registerApiRoutes } from './index.js';
import { createSessionStore } from '../sessions/store.js';
import { createPreferencesStore } from '../preferences/store.js';
import { createImageUploadStore } from '../uploads/image-store.js';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';

async function withServer(runner: RunnerOrchestrator, test: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-web-runner-routes-'));
  const preferencesStore = createPreferencesStore(path.join(tmpDir, 'preferences.json'));
  const imageUploadStore = createImageUploadStore(path.join(tmpDir, 'uploads'));

  registerApiRoutes(app, {
    runner,
    sessionStore: createSessionStore(),
    preferencesStore,
    imageUploadStore,
    config: {
      port: 0,
      nodeEnv: 'test',
      homeDir: '/tmp',
      sessionsDir: '/tmp/pi-web-route-test/sessions',
      piCwd: '/tmp',
      model: 'p/a',
      corsOrigins: [],
      logLevel: 'error',
      allowSystemdRestart: false,
      systemdServiceName: 'pi-web',
      restartStrategy: 'disabled',
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
    await Promise.all(disposables.map((runner) => runner.dispose().catch(() => undefined)));
    disposables.length = 0;
  });

  function fakeBridge(overrides: Partial<RunnerOrchestrator> = {}): RunnerOrchestrator {
    const runner: RunnerOrchestrator = {
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
    disposables.push(runner);
    return runner;
  }

  it('returns runner model failures as JSON 503 responses', async () => {
    await withServer(fakeBridge({ listModels: async () => { throw new Error('runner unavailable'); } }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/models?sessionId=session-1`);
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

  it('persists model preferences through the preferences API', async () => {
    await withServer(fakeBridge(), async (baseUrl) => {
      const putResponse = await fetch(`${baseUrl}/api/preferences/models`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          favorites: ['openai/gpt-4o', 'openai/gpt-4o', ''],
          recents: ['google-gemini/gemini-pro'],
          collapsedProviders: ['openai'],
        }),
      });
      expect(putResponse.status).toBe(200);

      const getResponse = await fetch(`${baseUrl}/api/preferences/models`);
      const body = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(body).toEqual({
        preferences: {
          favorites: ['openai/gpt-4o'],
          recents: ['google-gemini/gemini-pro'],
          collapsedProviders: ['openai'],
        },
      });
    });
  });

  it('uploads an image and injects file paths into the prompt payload', async () => {
    let receivedMessage = '';
    await withServer(fakeBridge({
      prompt: async (request) => {
        receivedMessage = request.message;
        return { sessionId: 'session-1', assistantMessage: '' };
      },
    }), async (baseUrl) => {
      const uploadResponse = await fetch(`${baseUrl}/api/uploads/image`, {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'x-session-id': 'session-1',
          'x-file-name': encodeURIComponent('diagram.png'),
        },
        body: Buffer.from('iVBORw0KGgo=', 'base64'),
      });
      expect(uploadResponse.status).toBe(201);
      const uploadBody = await uploadResponse.json() as { upload: { uploadId: string } };

      const promptResponse = await fetch(`${baseUrl}/api/messages/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session-1',
          cwd: '/tmp',
          message: 'analizza immagine',
          model: 'p/a',
          attachments: [{ uploadId: uploadBody.upload.uploadId }],
        }),
      });

      expect(promptResponse.status).toBe(202);
      expect(receivedMessage).toContain('analizza immagine');
      expect(receivedMessage).toContain('Use the read tool to inspect these image files when needed:');
      expect(receivedMessage).toContain('/uploads/');
    });
  });

  it('rejects missing image uploads in prompt payload', async () => {
    await withServer(fakeBridge(), async (baseUrl) => {
      const promptResponse = await fetch(`${baseUrl}/api/messages/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session-1',
          cwd: '/tmp',
          message: 'analizza immagine',
          model: 'p/a',
          attachments: [{ uploadId: 'missing-upload' }],
        }),
      });

      expect(promptResponse.status).toBe(400);
      expect(await promptResponse.json()).toEqual({ error: 'One or more image uploads are missing or expired' });
    });
  });

  it('deletes session-scoped uploads when the session is deleted', async () => {
    let receivedMessage = '';
    await withServer(fakeBridge({
      prompt: async (request) => {
        receivedMessage = request.message;
        return { sessionId: 'session-1', assistantMessage: '' };
      },
    }), async (baseUrl) => {
      await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'session-1', cwd: '/tmp', model: 'p/a' }),
      });

      const uploadResponse = await fetch(`${baseUrl}/api/uploads/image`, {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'x-session-id': 'session-1',
          'x-file-name': encodeURIComponent('test.png'),
        },
        body: Buffer.from('iVBORw0KGgo=', 'base64'),
      });
      const uploadBody = await uploadResponse.json() as { upload: { uploadId: string } };

      await fetch(`${baseUrl}/api/sessions/session-1`, { method: 'DELETE' });

      const promptResponse = await fetch(`${baseUrl}/api/messages/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session-1',
          cwd: '/tmp',
          message: 'analizza',
          model: 'p/a',
          attachments: [{ uploadId: uploadBody.upload.uploadId }],
        }),
      });

      expect(promptResponse.status).toBe(400);
      expect(receivedMessage).toBe('');
    });
  });

  it('rejects maintenance restart when disabled', async () => {
    await withServer(fakeBridge(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/maintenance/systemd/restart`, {
        method: 'POST',
      });
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toEqual({ error: 'Restart is disabled (set PI_WEB_ALLOW_SYSTEMD_RESTART=true or PI_WEB_RESTART_COMMAND)' });
    });
  });
});
