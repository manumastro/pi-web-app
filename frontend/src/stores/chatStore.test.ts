import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useChatStore } from './chatStore';

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      conversation: [],
      streaming: 'idle',
      statusMessage: 'Connecting…',
      error: '',
    });
    vi.unstubAllGlobals();
  });

  it('appends thinking above the assistant draft immediately on prompt send', () => {
    useChatStore.getState().appendPrompt('hello', 'opencode/big-pickle');

    const { conversation } = useChatStore.getState();
    expect(conversation).toHaveLength(3);
    expect(conversation[0]).toEqual(expect.objectContaining({ kind: 'message', role: 'user', content: 'hello' }));
    expect(conversation[1]).toEqual(expect.objectContaining({ kind: 'thinking', done: false }));
    expect(conversation[2]).toEqual(expect.objectContaining({ kind: 'message', role: 'assistant', status: 'streaming' }));
  });
});
