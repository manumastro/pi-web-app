import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useChatStore } from '@/stores/chatStore';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { useAssistantStatus } from './useAssistantStatus';

const useSessionStatusMock = vi.fn();
const useSessionPermissionsMock = vi.fn();
const useSessionQuestionsMock = vi.fn();
const useStreamingSessionMock = vi.fn();

vi.mock('@/sync/sync-context', () => ({
  useSessionStatus: (...args: unknown[]) => useSessionStatusMock(...args),
  useSessionPermissions: (...args: unknown[]) => useSessionPermissionsMock(...args),
  useSessionQuestions: (...args: unknown[]) => useSessionQuestionsMock(...args),
}));

vi.mock('@/sync/streaming', () => ({
  useStreamingSession: (...args: unknown[]) => useStreamingSessionMock(...args),
}));

function Probe() {
  const status = useAssistantStatus();
  return (
    <div>
      <div data-testid="activity">{status.activity}</div>
      <div data-testid="label">{status.label}</div>
      <div data-testid="statusText">{status.statusText ?? ''}</div>
      <div data-testid="working">{status.isWorking ? 'yes' : 'no'}</div>
    </div>
  );
}

describe('useAssistantStatus', () => {
  beforeEach(() => {
    useChatStore.setState({
      conversation: [],
      streaming: 'idle',
      statusMessage: '',
      error: '',
    });

    useSessionUiStore.setState({
      selectedDirectory: '/workspace/demo',
      selectedSessionId: 'session-1',
      currentSession: {
        id: 'session-1',
        cwd: '/workspace/demo',
        title: 'Demo',
        model: 'provider/model',
        status: 'idle',
        messages: [],
        createdAt: '2026-04-27T00:00:00.000Z',
        updatedAt: '2026-04-27T00:00:00.000Z',
      },
      visibleSessions: [],
    });

    useSessionStatusMock.mockReturnValue({ type: 'idle' });
    useSessionPermissionsMock.mockReturnValue([]);
    useSessionQuestionsMock.mockReturnValue([]);
    useStreamingSessionMock.mockReturnValue({ activeMessageId: null, phase: null });
  });

  it('shows Writing when assistant text is already streaming after tool calls', () => {
    useSessionStatusMock.mockReturnValue({ type: 'busy' });
    useChatStore.setState({
      conversation: [
        {
          kind: 'message',
          id: 'user-1',
          role: 'user',
          content: 'in che posizione è il milan?',
          timestamp: '2026-04-27T17:39:00.000Z',
          status: 'complete',
          messageId: 'turn-1',
        },
        {
          kind: 'tool_call',
          id: 'tool-1',
          toolCallId: 'tool-1',
          messageId: 'turn-1',
          toolName: 'web_search',
          input: 'classifica serie a',
          timestamp: '2026-04-27T17:39:01.000Z',
        },
        {
          kind: 'tool_result',
          id: 'tool-1-result',
          toolCallId: 'tool-1',
          messageId: 'turn-1',
          result: '{"position":9}',
          success: true,
          timestamp: '2026-04-27T17:39:01.300Z',
        },
        {
          kind: 'message',
          id: 'assistant-1',
          role: 'assistant',
          content: 'Il Milan è 9º con 54 punti.',
          timestamp: 'streaming',
          status: 'streaming',
          messageId: 'turn-1',
        },
      ],
    });

    render(<Probe />);

    expect(screen.getByTestId('activity')).toHaveTextContent('streaming');
    expect(screen.getByTestId('label')).toHaveTextContent('Writing...');
    expect(screen.getByTestId('working')).toHaveTextContent('yes');
  });

  it('does not mirror thinking text in working placeholder and shows runtime status instead', () => {
    useSessionStatusMock.mockReturnValue({ type: 'busy', message: 'Context usage updated', metadata: { contextWindow: 128000 } });
    useChatStore.setState({
      conversation: [
        {
          kind: 'message',
          id: 'user-3',
          role: 'user',
          content: 'scrivi un riepilogo',
          timestamp: '2026-04-27T17:41:00.000Z',
          status: 'complete',
          messageId: 'turn-3',
        },
        {
          kind: 'thinking',
          id: 'thinking-3',
          messageId: 'turn-3',
          content: 'Sto analizzando il progetto\npoi preparo la sintesi',
          done: false,
          timestamp: '2026-04-27T17:41:01.000Z',
        },
      ],
    });

    render(<Probe />);

    expect(screen.getByTestId('label')).toHaveTextContent('Working...');
    expect(screen.getByTestId('statusText')).toHaveTextContent('Context usage updated');
    expect(screen.getByTestId('statusText')).not.toHaveTextContent('Sto analizzando il progetto');
    expect(screen.getByTestId('working')).toHaveTextContent('yes');
  });

  it('shows Running <tool> while a tool call is still pending and no assistant text is visible', () => {
    useSessionStatusMock.mockReturnValue({ type: 'busy' });
    useChatStore.setState({
      conversation: [
        {
          kind: 'message',
          id: 'user-2',
          role: 'user',
          content: 'cerca classifica',
          timestamp: '2026-04-27T17:40:00.000Z',
          status: 'complete',
          messageId: 'turn-2',
        },
        {
          kind: 'tool_call',
          id: 'tool-2',
          toolCallId: 'tool-2',
          messageId: 'turn-2',
          toolName: 'web_search',
          input: 'classifica serie a',
          timestamp: '2026-04-27T17:40:01.000Z',
        },
        {
          kind: 'message',
          id: 'assistant-2',
          role: 'assistant',
          content: '',
          timestamp: 'streaming',
          status: 'streaming',
          messageId: 'turn-2',
        },
      ],
    });

    render(<Probe />);

    expect(screen.getByTestId('activity')).toHaveTextContent('tooling');
    expect(screen.getByTestId('label')).toHaveTextContent('Running web_search...');
    expect(screen.getByTestId('statusText')).toHaveTextContent('Running web_search · classifica serie a');
    expect(screen.getByTestId('working')).toHaveTextContent('yes');
  });

  it('does not expose generic Preparing status text and keeps activity label visible', () => {
    useSessionStatusMock.mockReturnValue({ type: 'busy', message: 'Preparing...' });
    useChatStore.setState({
      conversation: [
        {
          kind: 'message',
          id: 'user-4',
          role: 'user',
          content: 'fai un check',
          timestamp: '2026-04-27T17:42:00.000Z',
          status: 'complete',
          messageId: 'turn-4',
        },
        {
          kind: 'thinking',
          id: 'thinking-4',
          messageId: 'turn-4',
          content: 'analizzo',
          done: false,
          timestamp: '2026-04-27T17:42:01.000Z',
        },
      ],
    });

    render(<Probe />);

    expect(screen.getByTestId('activity')).toHaveTextContent('streaming');
    expect(screen.getByTestId('label')).toHaveTextContent('Working...');
    expect(screen.getByTestId('statusText')).toHaveTextContent('');
    expect(screen.getByTestId('working')).toHaveTextContent('yes');
  });
});
