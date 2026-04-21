import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { appendPrompt, applySsePayload, type ConversationItem } from './conversation';
import { applyStreamingPayloadState, hydrateStreamingSession, useStreamingStore } from './streaming';

function resetStreamingStore(): void {
  useStreamingStore.setState({
    streamingMessageIds: new Map(),
    messageStreamStates: new Map(),
  });
}

describe('streaming lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStreamingStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStreamingStore();
  });

  it('hydrates busy sessions with the last assistant turn as active streaming tail', () => {
    const conversation = appendPrompt([], 'hello', 'turn-1');
    hydrateStreamingSession('s1', conversation, 'busy');

    const state = useStreamingStore.getState();
    expect(state.streamingMessageIds.get('s1')).toBe('turn-1');
    expect(state.messageStreamStates.get('turn-1')?.phase).toBe('streaming');
  });

  it('moves from streaming to cooldown to completed on done payloads', () => {
    let conversation: ConversationItem[] = appendPrompt([], 'hello', 'turn-1');
    hydrateStreamingSession('s1', conversation, 'busy');

    conversation = applySsePayload(conversation, {
      type: 'text_chunk',
      sessionId: 's1',
      messageId: 'turn-1',
      content: 'Hi',
    });
    applyStreamingPayloadState('s1', {
      type: 'text_chunk',
      sessionId: 's1',
      messageId: 'turn-1',
      content: 'Hi',
    }, conversation);

    applyStreamingPayloadState('s1', {
      type: 'done',
      sessionId: 's1',
      messageId: 'turn-1',
      aborted: false,
    }, conversation);

    expect(useStreamingStore.getState().messageStreamStates.get('turn-1')?.phase).toBe('cooldown');

    vi.advanceTimersByTime(900);

    expect(useStreamingStore.getState().streamingMessageIds.get('s1')).toBeNull();
    expect(useStreamingStore.getState().messageStreamStates.get('turn-1')?.phase).toBe('completed');
  });
});
