import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reduceSessionLifecyclePayload } from './event-reducer';
import { ChildStoreManager } from './child-store';
import { setSyncRefs, getDirectoryState } from './sync-refs';
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

function createReducerDeps(directory?: string) {
  return {
    directory,
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

  it('preserves previous status metadata when later status payload omits metadata', () => {
    const directory = '/workspace/demo';
    const childStores = new ChildStoreManager();
    setSyncRefs(childStores, directory);
    childStores.ensureChild(directory, { bootstrap: false });
    childStores.update(directory, (state) => ({
      ...state,
      session_status: {
        ...state.session_status,
        'session-1': {
          type: 'busy',
          metadata: { contextPercent: 42.1, contextWindow: 128000 },
        },
      },
    }));

    const deps = createReducerDeps(directory);
    reduceSessionLifecyclePayload([], {
      type: 'status',
      sessionId: 'session-1',
      status: 'busy',
      message: 'Working',
    }, deps);

    expect(getDirectoryState(directory)?.session_status['session-1']?.metadata).toEqual({ contextPercent: 42.1, contextWindow: 128000 });
  });

  it('stores status message and metadata on the session snapshot for reload/switch rehydration', () => {
    const deps = createReducerDeps('/workspace/demo');

    reduceSessionLifecyclePayload([], {
      type: 'status',
      sessionId: 'session-1',
      status: 'busy',
      message: 'Context usage updated',
      metadata: { contextPercent: 51.2, contextWindow: 200000, autoCompactionEnabled: true },
    }, deps);

    const session = useSessionStore.getState().sessions.find((entry) => entry.id === 'session-1');
    expect(session?.statusMessage).toBe('Context usage updated');
    expect(session?.statusMetadata).toEqual({ contextPercent: 51.2, contextWindow: 200000, autoCompactionEnabled: true });
  });
});
