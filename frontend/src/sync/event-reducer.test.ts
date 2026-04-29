import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reduceSessionLifecyclePayload } from './event-reducer';
import { useSessionStore } from '@/stores/sessionStore';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import type { SessionInfo } from '@/types';

const sessionFixture: SessionInfo = {
  id: 'session-1',
  cwd: '/workspace/demo',
  title: 'Demo session',
  model: 'provider/demo-model',
  status: 'idle',
  messages: [],
  createdAt: '2026-04-20T00:00:00.000Z',
  updatedAt: '2026-04-20T00:00:00.000Z',
};

function createReducerDeps() {
  return {
    setConversation: vi.fn(),
    updateSession: (id: string, updates: Partial<SessionInfo>) => {
      useSessionStore.getState().updateSession(id, updates);
    },
    setStreaming: vi.fn(),
    setStatusMessage: vi.fn(),
    setError: vi.fn(),
  };
}

describe('event reducer session-ui sync', () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [sessionFixture],
      sessionStatuses: { [sessionFixture.id]: sessionFixture.status },
      sortedSessions: [sessionFixture],
    });

    useSessionUiStore.setState({
      selectedDirectory: '/workspace/demo',
      selectedSessionId: 'session-1',
      currentSession: sessionFixture,
      visibleSessions: [sessionFixture],
    });
  });

  it('keeps selected session UI status in sync when running payloads arrive', () => {
    const deps = createReducerDeps();

    reduceSessionLifecyclePayload([], {
      type: 'text_chunk',
      sessionId: 'session-1',
      messageId: 'turn-1',
      content: 'Hi',
    }, deps);

    expect(useSessionStore.getState().sessions.find((entry) => entry.id === 'session-1')?.status).toBe('busy');
    expect(useSessionUiStore.getState().currentSession?.status).toBe('busy');
    expect(useSessionUiStore.getState().visibleSessions.find((entry) => entry.id === 'session-1')?.status).toBe('busy');
  });

  it('keeps selected session UI status in sync when completion payloads arrive', () => {
    const deps = createReducerDeps();

    const afterChunk = reduceSessionLifecyclePayload([], {
      type: 'text_chunk',
      sessionId: 'session-1',
      messageId: 'turn-1',
      content: 'Hi',
    }, deps);

    reduceSessionLifecyclePayload(afterChunk, {
      type: 'done',
      sessionId: 'session-1',
      messageId: 'turn-1',
      aborted: false,
    }, deps);

    expect(useSessionStore.getState().sessions.find((entry) => entry.id === 'session-1')?.status).toBe('idle');
    expect(useSessionUiStore.getState().currentSession?.status).toBe('idle');
    expect(useSessionUiStore.getState().visibleSessions.find((entry) => entry.id === 'session-1')?.status).toBe('idle');
  });

  it('sets transport streaming state back to idle on status=idle payloads', () => {
    const deps = createReducerDeps();

    reduceSessionLifecyclePayload([], {
      type: 'status',
      sessionId: 'session-1',
      status: 'idle',
      message: 'CLI idle',
    }, deps);

    expect(deps.setStreaming).toHaveBeenCalledWith('idle');
  });
});
