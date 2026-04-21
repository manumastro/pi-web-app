import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import type { SessionInfo } from './types';
import { useChatStore } from './stores/chatStore';
import { useProjectStore } from './stores/projectStore';
import { useSessionStore } from './stores/sessionStore';
import { useSessionUiStore } from './stores/sessionUiStore';
import { useUIStore } from './stores/uiStore';
import { useInputStore } from './sync/input-store';
import { createProjectIdFromPath } from './lib/path';

const useSessionStreamMock = vi.fn();
const apiGetMock = vi.fn();
const apiRequestMock = vi.fn();

vi.mock('@/hooks/useSessionStream', () => ({
  useSessionStream: (...args: unknown[]) => useSessionStreamMock(...args),
}));

vi.mock('@/api', () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

const session: SessionInfo = {
  id: 'session-1',
  cwd: '/tmp/project',
  title: 'First session',
  model: 'anthropic/claude-3-5-sonnet-20241022',
  status: 'idle',
  messages: [],
  createdAt: '2026-04-15T10:00:00.000Z',
  updatedAt: '2026-04-15T10:00:00.000Z',
};

beforeEach(() => {
  useSessionStreamMock.mockReset();
  apiGetMock.mockReset();
  apiRequestMock.mockReset();

  useChatStore.setState({
    conversation: [],
    streaming: 'idle',
    statusMessage: 'Connecting',
    error: '',
  });
  useSessionStore.setState({
    sessions: [],
    sessionStatuses: {},
    sortedSessions: [],
  });

  useSessionUiStore.setState({
    selectedDirectory: '/tmp',
    selectedSessionId: '',
    currentSession: undefined,
    visibleSessions: [],
  });
  useProjectStore.setState({
    homeDirectory: '/tmp',
    projects: [
      {
        id: createProjectIdFromPath('/tmp'),
        path: '/tmp',
        label: '~',
        addedAt: '2026-04-15T10:00:00.000Z',
        updatedAt: '2026-04-15T10:00:00.000Z',
      },
    ],
    activeProjectId: createProjectIdFromPath('/tmp'),
  });
  useUIStore.setState({
    sidebarOpen: true,
    modelFilter: '',
    showReasoningTraces: true,
    models: [],
    activeModelKey: '',
    prompt: '',
  });
  useInputStore.setState({
    pendingInputText: null,
    pendingInputMode: 'replace',
    pendingSyntheticParts: null,
    attachedFiles: [],
  });

  apiGetMock.mockImplementation(async (path: string) => {
    if (path === '/api/config') {
      return { homeDir: '/tmp', sdkCwd: '/tmp', sessionsDir: '/tmp/.pi/agent/sessions' };
    }
    if (path === '/api/sessions') {
      return { sessions: [session] };
    }
    if (path === '/api/sessions/session-1') {
      return { session };
    }
    if (path === '/api/models?sessionId=session-1') {
      return {
        models: [
          {
            key: 'anthropic/claude-3-5-sonnet-20241022',
            id: 'claude-3-5-sonnet-20241022',
            name: 'Claude 3.5 Sonnet',
            available: true,
            isSelected: true,
            provider: 'anthropic',
            reasoning: true,
          },
          {
            key: 'openai/gpt-4o',
            id: 'gpt-4o',
            name: 'GPT-4o',
            available: true,
            isSelected: false,
            provider: 'openai',
            reasoning: false,
          },
        ],
      };
    }
    if (path === '/api/models/session/thinking?sessionId=session-1') {
      return {
        currentLevel: 'medium',
        availableLevels: ['minimal', 'low', 'medium', 'high'],
      };
    }
    if (path === '/api/models') {
      return {
        models: [
          {
            key: 'anthropic/claude-3-5-sonnet-20241022',
            id: 'claude-3-5-sonnet-20241022',
            name: 'Claude 3.5 Sonnet',
            available: true,
            isSelected: true,
            provider: 'anthropic',
            reasoning: true,
          },
        ],
      };
    }
    throw new Error(`Unexpected apiGet path: ${path}`);
  });

  apiRequestMock.mockImplementation(async (path: string, init: RequestInit) => {
    if (path === '/api/models/session/model' && init.method === 'PUT') {
      return { session };
    }
    if (path === '/api/messages/prompt' && init.method === 'POST') {
      return {};
    }
    if (path === '/api/sessions' && init.method === 'POST') {
      return { session };
    }
    throw new Error(`Unexpected apiRequest path: ${path}`);
  });
});

describe('App', () => {
  it('renders and can send a prompt', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Prompt' }), { target: { value: 'hello world' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/messages/prompt',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('reloads the active session when prompt submission fails', async () => {
    apiRequestMock.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === '/api/models/session/model' && init.method === 'PUT') {
        return { session };
      }
      if (path === '/api/messages/prompt' && init.method === 'POST') {
        throw new Error('Failed to fetch');
      }
      throw new Error(`Unexpected apiRequest path: ${path}`);
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Prompt' }), { target: { value: 'second message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith('/api/sessions/session-1');
    });
  });
});
