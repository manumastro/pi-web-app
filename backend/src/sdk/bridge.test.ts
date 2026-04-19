import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore } from '../sessions/store.js';
import { createSseManager } from '../sse/manager.js';
import { createSdkBridge } from './bridge.js';

const mocks = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  authStorageCreateMock: vi.fn(() => ({})),
  modelRegistryCreateMock: vi.fn(() => {
    const availableKeys = new Set([
      'anthropic/claude-3-5-sonnet-20241022',
      'ollama/llama-3.1-70b',
    ]);

    return {
      refresh: vi.fn(),
      getAll: vi.fn(() => [
        { provider: 'anthropic', id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 16384 },
        { provider: 'openai', id: 'gpt-4.1', name: 'GPT-4.1', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 16384 },
        { provider: 'ollama', id: 'llama-3.1-70b', name: 'Llama 3.1 70B', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 16384 },
      ]),
      getAvailable: vi.fn(() => [
        { provider: 'anthropic', id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 16384 },
        { provider: 'ollama', id: 'llama-3.1-70b', name: 'Llama 3.1 70B', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 16384 },
      ]),
      hasConfiguredAuth: vi.fn((model: { provider: string; id: string }) => availableKeys.has(`${model.provider}/${model.id}`)),
      find: vi.fn((provider: string, id: string) => ({ provider, id, name: `${provider}/${id}`, reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 16384 })),
    };
  }),
  sessionManagerInMemoryMock: vi.fn(() => ({})),
  settingsManagerApplyOverridesMock: vi.fn(),
  settingsManagerCreateMock: vi.fn(() => ({
    applyOverrides: mocks.settingsManagerApplyOverridesMock,
  })),
}));

vi.mock('@mariozechner/pi-coding-agent', () => ({
  AgentSession: class AgentSession {},
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
        { type: 'question', questionId: 'q1', question: 'Continue?', options: ['yes', 'no'] },
        { type: 'permission', permissionId: 'p1', action: 'write', resource: '/tmp/file' },
        { type: 'message_end', message: { ...baseMessage, content: 'Hello' } },
        { type: 'agent_end', messages: [] },
      ]) {
        for (const listener of listeners) {
          listener(event);
        }
      }
      return text;
    }),
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
    mocks.settingsManagerApplyOverridesMock.mockClear();
    mocks.settingsManagerCreateMock.mockClear();
  });

  it('streams sdk events into the session store and SSE manager', async () => {
    mocks.createAgentSessionMock.mockResolvedValue(createFakeAgentSession());

    const sessionStore = createSessionStore();
    const sseManager = createSseManager();
    const events: string[] = [];
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
        model: 'anthropic/claude-3-5-sonnet-20241022',
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
      model: 'anthropic/claude-3-5-sonnet-20241022',
    });

    expect(result.sessionId).toBe('session-1');
    expect(mocks.createAgentSessionMock).toHaveBeenCalled();
    expect(mocks.settingsManagerCreateMock).toHaveBeenCalledWith('/tmp/project');
    expect(mocks.settingsManagerApplyOverridesMock).toHaveBeenCalledWith({
      compaction: { enabled: false },
    });
    expect(sessionStore.getSession('session-1')?.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello SDK' }),
      expect.objectContaining({ role: 'assistant', content: 'Hello' }),
    ]);
    expect(sessionStore.getSession('session-1')?.status).toBe('done');
    expect(events.join('')).toContain('event: text_chunk');
    expect(events.join('')).toContain('event: question');
    expect(events.join('')).toContain('event: permission');
    expect(events.join('')).toContain('event: done');
  });

  it('updates the model through the sdk registry when auth is configured', async () => {
    const fake = createFakeAgentSession();
    mocks.createAgentSessionMock.mockResolvedValue(fake);

    const sessionStore = createSessionStore();
    sessionStore.createSession('/tmp/project', 'anthropic/claude-3-5-sonnet-20241022', 'session-2');
    const sseManager = createSseManager();
    const bridge = createSdkBridge({
      config: {
        port: 3210,
        nodeEnv: 'development',
        sessionsDir: '/tmp/sessions',
        sdkCwd: '/tmp/project',
        model: 'anthropic/claude-3-5-sonnet-20241022',
        corsOrigins: [],
        logLevel: 'info',
        sessionIdPrefix: 'session',
        generateSessionId: () => 'generated-session-id',
      },
      sessionStore,
      sseManager,
    });

    await bridge.setModel('session-2', 'ollama/llama-3.1-70b');

    expect(fake.session.setModel).toHaveBeenCalled();
    expect(sessionStore.getSession('session-2')?.model).toBe('ollama/llama-3.1-70b');
  });

  it('keeps the requested model selection intact when updating the model', async () => {
    const fake = createFakeAgentSession();
    mocks.createAgentSessionMock.mockResolvedValue(fake);

    const sessionStore = createSessionStore();
    sessionStore.createSession('/tmp/project', 'anthropic/claude-3-5-sonnet-20241022', 'session-3');
    const sseManager = createSseManager();
    const bridge = createSdkBridge({
      config: {
        port: 3210,
        nodeEnv: 'development',
        sessionsDir: '/tmp/sessions',
        sdkCwd: '/tmp/project',
        model: 'anthropic/claude-3-5-sonnet-20241022',
        corsOrigins: [],
        logLevel: 'info',
        sessionIdPrefix: 'session',
        generateSessionId: () => 'generated-session-id',
      },
      sessionStore,
      sseManager,
    });

    await bridge.setModel('session-3', 'openai/gpt-4.1');

    expect(fake.session.setModel).toHaveBeenCalled();
    expect(sessionStore.getSession('session-3')?.model).toBe('openai/gpt-4.1');
  });

  it('keeps the requested model selection intact during prompting', async () => {
    const fake = createFakeAgentSession();
    mocks.createAgentSessionMock.mockResolvedValue(fake);

    const sessionStore = createSessionStore();
    const sseManager = createSseManager();
    const bridge = createSdkBridge({
      config: {
        port: 3210,
        nodeEnv: 'development',
        sessionsDir: '/tmp/sessions',
        sdkCwd: '/tmp/project',
        model: 'anthropic/claude-3-5-sonnet-20241022',
        corsOrigins: [],
        logLevel: 'info',
        sessionIdPrefix: 'session',
        generateSessionId: () => 'generated-session-id',
      },
      sessionStore,
      sseManager,
    });

    const result = await bridge.prompt({
      sessionId: 'session-4',
      cwd: '/tmp/project',
      message: 'Hello big-pickle',
      model: 'openai/gpt-4.1',
    });

    expect(result.sessionId).toBe('session-4');
    expect(fake.session.setModel).toHaveBeenCalled();
    expect(sessionStore.getSession('session-4')?.model).toBe('openai/gpt-4.1');
  });

  it('lists all models (available and unavailable) from the sdk registry', async () => {
    const bridge = createSdkBridge({
      config: {
        port: 3210,
        nodeEnv: 'development',
        sessionsDir: '/tmp/sessions',
        sdkCwd: '/tmp/project',
        model: 'anthropic/claude-3-5-sonnet-20241022',
        corsOrigins: [],
        logLevel: 'info',
        sessionIdPrefix: 'session',
        generateSessionId: () => 'generated-session-id',
      },
      sessionStore: createSessionStore(),
      sseManager: createSseManager(),
    });

    const models = await bridge.listModels('anthropic/claude-3-5-sonnet-20241022');
    // Should include all models, not just available ones
    expect(models.map((model) => model.key).sort()).toEqual([
      'anthropic/claude-3-5-sonnet-20241022',
      'ollama/llama-3.1-70b',
      'openai/gpt-4.1',
    ]);
    // But only 2 should be marked as available
    const availableModels = models.filter((m) => m.available);
    expect(availableModels).toHaveLength(2);
    expect(availableModels.map((m) => m.key).sort()).toEqual([
      'anthropic/claude-3-5-sonnet-20241022',
      'ollama/llama-3.1-70b',
    ]);
  });
});
