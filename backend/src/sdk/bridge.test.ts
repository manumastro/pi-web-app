import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore } from '../sessions/store.js';
import { createSseManager } from '../sse/manager.js';
import { createSdkBridge } from './bridge.js';

const mocks = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  authStorageCreateMock: vi.fn(() => ({})),
  modelRegistryCreateMock: vi.fn(() => ({
    find: vi.fn((_provider: string, modelId: string) => ({ id: modelId, provider: 'anthropic' })),
  })),
  sessionManagerInMemoryMock: vi.fn(() => ({})),
  settingsManagerCreateMock: vi.fn(() => ({})),
}));

vi.mock('@mariozechner/pi-coding-agent', () => ({
  AuthStorage: { create: mocks.authStorageCreateMock },
  ModelRegistry: { create: mocks.modelRegistryCreateMock },
  SessionManager: { inMemory: mocks.sessionManagerInMemoryMock },
  SettingsManager: { create: mocks.settingsManagerCreateMock },
  createAgentSession: mocks.createAgentSessionMock,
}));

function createFakeAgentSession() {
  const listeners = new Set<(event: { type: string; [key: string]: unknown }) => void>();
  const agent = {
    sessionId: '',
    state: {
      messages: [] as unknown[],
    },
  };

  const session = {
    agent,
    isStreaming: true,
    subscribe(listener: (event: { type: string; [key: string]: unknown }) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    prompt: vi.fn(async (text: string) => {
      const baseMessage = { role: 'assistant', content: '', timestamp: Date.now() };
      for (const event of [
        { type: 'agent_start' },
        { type: 'message_start', message: baseMessage },
        { type: 'message_update', message: baseMessage, assistantMessageEvent: { type: 'text_delta', delta: 'Hel' } },
        { type: 'message_update', message: baseMessage, assistantMessageEvent: { type: 'text_delta', delta: 'lo' } },
        { type: 'message_end', message: { ...baseMessage, content: 'Hello' } },
        { type: 'agent_end', messages: [] },
      ]) {
        for (const listener of listeners) {
          listener(event);
        }
      }
      return text;
    }),
    steer: vi.fn(),
    followUp: vi.fn(),
    abort: vi.fn(),
    setModel: vi.fn(),
  };

  return { session };
}

describe('sdk bridge', () => {
  beforeEach(() => {
    mocks.createAgentSessionMock.mockReset();
    mocks.modelRegistryCreateMock.mockClear();
    mocks.authStorageCreateMock.mockClear();
    mocks.sessionManagerInMemoryMock.mockClear();
    mocks.settingsManagerCreateMock.mockClear();
  });

  it('streams sdk events into the session store and SSE manager', async () => {
    mocks.createAgentSessionMock.mockResolvedValue(createFakeAgentSession());

    const sessionStore = createSessionStore();
    const sseManager = createSseManager();
    const events: unknown[] = [];
    const response = {
      write(chunk: string) {
        events.push(chunk);
      },
    } as never;
    sseManager.subscribe('session-1', response);

    const bridge = createSdkBridge({
      config: {
        port: 3210,
        nodeEnv: 'development',
        sessionsDir: '/tmp/sessions',
        sdkCwd: '/tmp/project',
        model: 'claude-3-5-sonnet-20241022',
        corsOrigins: [],
        logLevel: 'info',
        sessionIdPrefix: 'session',
        generateSessionId: () => 'generated-session-id',
      },
      sessionStore,
      sseManager,
    });

    const result = await bridge.prompt({
      sessionId: 'session-1',
      cwd: '/tmp/project',
      message: 'Hello SDK',
      model: 'claude-3-5-sonnet-20241022',
    });

    expect(result.sessionId).toBe('session-1');
    expect(mocks.createAgentSessionMock).toHaveBeenCalled();
    expect(sessionStore.getSession('session-1')?.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello SDK' }),
      expect.objectContaining({ role: 'assistant', content: 'Hello' }),
    ]);
    expect(sessionStore.getSession('session-1')?.status).toBe('done');
    expect(events.join('')).toContain('event: text_chunk');
    expect(events.join('')).toContain('event: done');
  });

  it('routes steer and follow-up through the active sdk session', async () => {
    const fake = createFakeAgentSession();
    mocks.createAgentSessionMock.mockResolvedValue(fake);

    const sessionStore = createSessionStore();
    sessionStore.createSession('/tmp/project', 'claude-3-5-sonnet-20241022', 'session-3');
    const sseManager = createSseManager();
    const bridge = createSdkBridge({
      config: {
        port: 3210,
        nodeEnv: 'development',
        sessionsDir: '/tmp/sessions',
        sdkCwd: '/tmp/project',
        model: 'claude-3-5-sonnet-20241022',
        corsOrigins: [],
        logLevel: 'info',
        sessionIdPrefix: 'session',
        generateSessionId: () => 'generated-session-id',
      },
      sessionStore,
      sseManager,
    });

    await bridge.steer('session-3', 'please focus on security');
    await bridge.followUp('session-3', 'also explain the changes');

    expect(fake.session.steer).toHaveBeenCalledWith('please focus on security');
    expect(fake.session.followUp).toHaveBeenCalledWith('also explain the changes');
  });

  it('updates the model through the sdk registry', async () => {
    const fake = createFakeAgentSession();
    mocks.createAgentSessionMock.mockResolvedValue(fake);

    const sessionStore = createSessionStore();
    sessionStore.createSession('/tmp/project', 'claude-3-5-sonnet-20241022', 'session-2');
    const sseManager = createSseManager();
    const bridge = createSdkBridge({
      config: {
        port: 3210,
        nodeEnv: 'development',
        sessionsDir: '/tmp/sessions',
        sdkCwd: '/tmp/project',
        model: 'claude-3-5-sonnet-20241022',
        corsOrigins: [],
        logLevel: 'info',
        sessionIdPrefix: 'session',
        generateSessionId: () => 'generated-session-id',
      },
      sessionStore,
      sseManager,
    });

    await bridge.setModel('session-2', 'gpt-4.1');

    expect(fake.session.setModel).toHaveBeenCalled();
    expect(sessionStore.getSession('session-2')?.model).toBe('gpt-4.1');
  });
});
