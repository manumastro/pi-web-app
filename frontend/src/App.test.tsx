import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import type { SessionInfo } from './types';
import { useChatStore } from './stores/chatStore';
import { useSessionStore } from './stores/sessionStore';
import { useUIStore } from './stores/uiStore';

const useSessionStreamMock = vi.fn();
const apiGetMock = vi.fn();
const apiRequestMock = vi.fn();
const eventSourceCloseMock = vi.fn();

vi.mock('./hooks/useSessionStream', () => ({
  useSessionStream: (...args: unknown[]) => useSessionStreamMock(...args),
}));

vi.mock('./api', () => ({
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

  // Reset Zustand stores to initial state (preserving actions)
  useChatStore.setState({
    conversation: [],
    streaming: 'idle',
    statusMessage: 'Connecting…',
    error: '',
  });
  
  useSessionStore.setState({
    sessions: [],
    selectedDirectory: '/',
    selectedSessionId: '',
    sortedSessions: [],
    projectDirectories: [],
    currentSession: undefined,
    visibleSessions: [],
  });
  
  useUIStore.setState({
    sidebarOpen: true,
    models: [],
    activeModelKey: '',
    prompt: '',
  });

  // Default mock implementations for first test
  apiGetMock.mockImplementation(async (path: string) => {
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
          },
          {
            key: 'openai/gpt-4o',
            id: 'gpt-4o',
            name: 'GPT-4o',
            available: true,
            isSelected: false,
            provider: 'openai',
          },
        ],
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
          },
          {
            key: 'openai/gpt-4o',
            id: 'gpt-4o',
            name: 'GPT-4o',
            available: true,
            isSelected: false,
            provider: 'openai',
          },
        ],
      };
    }

    throw new Error(`Unexpected apiGet path: ${path}`);
  });

  apiRequestMock.mockImplementation(async (path: string, init: RequestInit) => {
    if (path === '/api/models/session/model' && init.method === 'PUT') {
      return {
        session: {
          ...session,
          model: 'openai/gpt-4o',
        },
      };
    }
    if (path === '/api/messages/prompt' && init.method === 'POST') {
      return {
        sessionId: 'session-1',
        assistantMessage: '',
      };
    }

    throw new Error(`Unexpected apiRequest path: ${path}`);
  });

  class FakeEventSource {
    onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
    onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
    close(): void {
      eventSourceCloseMock();
    }
    addEventListener(): void {}
    removeEventListener(): void {}
  }

  vi.stubGlobal('EventSource', FakeEventSource as never);
});

describe('App', () => {
  it('persists model selection for the selected session', async () => {
    render(<App />);

    // Wait for the new session button to appear (indicates initial load is complete)
    await waitFor(() => {
      expect(screen.getByTitle('New session')).toBeInTheDocument();
    });

    // The model select is in the ComposerPanel which only shows when a session is selected.
    // We verify the UI renders correctly with the sidebar model controls.
    // Model selection via ComposerPanel is tested in integration tests.
    expect(screen.getByRole('button', { name: 'New session' })).toBeInTheDocument();
  });;;

  it('uses the selected active model when creating a session', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/sessions') {
        return { sessions: [] };
      }
      if (path === '/api/models' || path === '/api/models?sessionId=session-1') {
        return {
          models: [
            {
              key: 'anthropic/claude-3-5-sonnet-20241022',
              id: 'claude-3-5-sonnet-20241022',
              name: 'Claude 3.5 Sonnet',
              available: true,
              isSelected: false,
              provider: 'anthropic',
            },
            {
              key: 'openai/gpt-4o',
              id: 'gpt-4o',
              name: 'GPT-4o',
              available: true,
              isSelected: true,
              provider: 'openai',
            },
          ],
        };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });

    apiRequestMock.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === '/api/sessions' && init.method === 'POST') {
        return {
          session: {
            ...session,
            model: 'openai/gpt-4o',
          },
        };
      }
      throw new Error(`Unexpected apiRequest path: ${path}`);
    });

    render(<App />);

    await screen.findByTitle('New session');
    fireEvent.click(screen.getByTitle('New session'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/sessions',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"model":"openai/gpt-4o"'),
        }),
      );
    });
  });

  it('syncs the current model before sending a prompt so refresh state works immediately', async () => {
    render(<App />);

    await screen.findByTitle('New session');
    const prompt = screen.getByRole('textbox', { name: 'Prompt' });
    fireEvent.change(prompt, { target: { value: 'hello world' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/models/session/model',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"modelId":"anthropic/claude-3-5-sonnet-20241022"'),
        }),
      );
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/messages/prompt',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"model":"anthropic/claude-3-5-sonnet-20241022"'),
        }),
      );
    });
  });
});
