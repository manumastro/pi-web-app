import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, sendPrompt, updateSessionModel } from './session-actions';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { useUIStore } from '@/stores/uiStore';

const sessionFixture = {
  id: 'session-1',
  cwd: '/workspace/demo',
  title: 'Demo session',
  model: 'provider/demo-model',
  status: 'idle',
  messages: [],
  createdAt: '2026-04-20T00:00:00.000Z',
  updatedAt: '2026-04-20T00:00:00.000Z',
};

function resetStores(): void {
  useSessionStore.setState({
    sessions: [],
    sessionStatuses: {},
    sortedSessions: [],
  });

  useSessionUiStore.setState({
    selectedDirectory: '/',
    selectedSessionId: '',
    currentSession: undefined,
    visibleSessions: [],
  });

  useUIStore.setState({
    sidebarOpen: true,
    modelFilter: '',
    showReasoningTraces: true,
    models: [
      {
        key: 'provider/demo-model',
        id: 'demo-model',
        label: 'Demo model',
        available: true,
        active: true,
        provider: 'provider',
        reasoning: true,
      },
    ],
    activeModelKey: 'provider/demo-model',
    prompt: 'hello',
  });

  useChatStore.setState({
    conversation: [],
    streaming: 'idle',
    statusMessage: '',
    error: '',
  });
}

describe('session actions', () => {
  beforeEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it('creates a session and selects it in the local stores', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/sessions' && init?.method === 'POST') {
        return new Response(JSON.stringify({ session: sessionFixture }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const created = await createSession({ cwd: '/workspace/demo', model: 'provider/demo-model' });

    expect(created).toEqual(sessionFixture);
    expect(useSessionUiStore.getState().selectedSessionId).toBe('session-1');
    expect(useSessionUiStore.getState().selectedDirectory).toBe('/workspace/demo');
    expect(useUIStore.getState().activeModelKey).toBe('provider/demo-model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('updates the session model before sending a prompt', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/models/session/model' && init?.method === 'PUT') {
        return new Response(JSON.stringify({ session: sessionFixture }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/messages/prompt' && init?.method === 'POST') {
        return new Response('', { status: 202 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    useSessionStore.setState({
      sessions: [sessionFixture],
      sessionStatuses: { 'session-1': 'idle' },
      sortedSessions: [sessionFixture],
    });

    useSessionUiStore.setState({
      selectedDirectory: '/workspace/demo',
      selectedSessionId: 'session-1',
      currentSession: sessionFixture,
      visibleSessions: [sessionFixture],
    });

    const ok = await sendPrompt({
      sessionId: 'session-1',
      cwd: '/workspace/demo',
      message: 'Run the build',
      model: 'provider/demo-model',
      turnId: 'turn-1',
    });

    expect(ok).toBe(true);
    expect(useChatStore.getState().conversation).toHaveLength(3);
    expect(useUIStore.getState().prompt).toBe('');
    expect(useChatStore.getState().streaming).toBe('streaming');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('generates and reuses a turn id when none is provided', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/models/session/model' && init?.method === 'PUT') {
        return new Response(JSON.stringify({ session: sessionFixture }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/messages/prompt' && init?.method === 'POST') {
        return new Response('', { status: 202 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    useSessionStore.setState({
      sessions: [sessionFixture],
      sessionStatuses: { 'session-1': 'idle' },
      sortedSessions: [sessionFixture],
    });

    useSessionUiStore.setState({
      selectedDirectory: '/workspace/demo',
      selectedSessionId: 'session-1',
      currentSession: sessionFixture,
      visibleSessions: [sessionFixture],
    });

    const ok = await sendPrompt({
      sessionId: 'session-1',
      cwd: '/workspace/demo',
      message: 'Run the build',
      model: 'provider/demo-model',
    });

    expect(ok).toBe(true);
    const [, promptCall] = fetchMock.mock.calls;
    const promptBody = JSON.parse(String(promptCall?.[1]?.body ?? '{}')) as { messageId?: string };
    expect(typeof promptBody.messageId).toBe('string');
    expect(promptBody.messageId).toBeTruthy();

    const [optimisticUser, optimisticThinking, optimisticAssistant] = useChatStore.getState().conversation;
    expect(optimisticUser?.kind).toBe('message');
    expect(optimisticThinking?.kind).toBe('thinking');
    expect(optimisticAssistant?.kind).toBe('message');
    if (optimisticUser?.kind === 'message' && optimisticThinking?.kind === 'thinking' && optimisticAssistant?.kind === 'message') {
      expect(optimisticUser.messageId).toBe(promptBody.messageId);
      expect(optimisticThinking.messageId).toBe(promptBody.messageId);
      expect(optimisticAssistant.messageId).toBe(promptBody.messageId);
    }
  });

  it('keeps the active model in sync when the backend returns an updated session', async () => {
    const updatedSession = { ...sessionFixture, model: 'provider/alternate-model' };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/models/session/model' && init?.method === 'PUT') {
        return new Response(JSON.stringify({ session: updatedSession }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateSessionModel('session-1', 'provider/alternate-model');

    expect(result).toEqual(updatedSession);
    expect(useSessionUiStore.getState().selectedSessionId).toBe('session-1');
    expect(useUIStore.getState().activeModelKey).toBe('provider/alternate-model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
