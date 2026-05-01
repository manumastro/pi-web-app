import { describe, expect, it } from 'vitest';
import { applySsePayload, appendPrompt, rehydrateConversationForSession, type ConversationItem } from './conversation';

describe('conversation fallback matching', () => {
  it('appends text chunks to the latest assistant fallback when messageId is unknown', () => {
    const firstTurn = appendPrompt([], 'hi', 'turn-1').map((item) => {
      if (item.kind === 'message' && item.role === 'assistant') {
        return { ...item, status: 'complete' as const, content: 'Hi! How can I help you today?' };
      }
      if (item.kind === 'thinking') {
        return { ...item, done: true };
      }
      return item;
    });

    const withSecondTurn = appendPrompt(firstTurn, 'il quale cwd', 'turn-2');

    const updated = applySsePayload(withSecondTurn, {
      type: 'text_chunk',
      sessionId: 'session-1',
      messageId: 'backend-turn-2',
      content: 'The current working directory is /home/manu/pi-web-app.',
    });

    const assistants = updated
      .filter((item) => item.kind === 'message' && item.role === 'assistant')
      .map((item) => item as ConversationItem & { kind: 'message'; role: 'assistant'; content: string });

    expect(assistants).toHaveLength(2);
    expect(assistants[0]?.content).toBe('Hi! How can I help you today?');
    expect(assistants[1]?.content).toContain('/home/manu/pi-web-app');
  });

  it('updates the latest thinking fallback when messageId is unknown', () => {
    const items = appendPrompt([], 'hello', 'turn-1');

    const updated = applySsePayload(items, {
      type: 'thinking',
      sessionId: 'session-1',
      messageId: 'unknown-turn',
      content: 'Reasoning chunk',
      done: false,
    });

    const thinkingItems = updated.filter((item) => item.kind === 'thinking');
    expect(thinkingItems).toHaveLength(1);
    expect(thinkingItems[0]?.content).toContain('Reasoning chunk');
  });

  it('preserves optimistic messageId on first chunk when SSE messageId differs', () => {
    const items = appendPrompt([], 'hello', 'turn-1');

    const updated = applySsePayload(items, {
      type: 'text_chunk',
      sessionId: 'session-1',
      messageId: 'backend-turn-1',
      content: 'ciao',
    });

    const assistants = updated.filter((item) => item.kind === 'message' && item.role === 'assistant');
    expect(assistants).toHaveLength(1);
    const assistant = assistants[0];
    if (assistant?.kind === 'message') {
      // The messageId is preserved as the optimistic turnId so the assistant
      // stays in the same turn as its paired thinking item in buildRenderRecords.
      expect(assistant.messageId).toBe('turn-1');
      expect(assistant.content).toBe('ciao');
    }
  });

  it('ignores premature done without messageId when assistant is still an empty streaming placeholder', () => {
    const items = appendPrompt([], 'hello', 'turn-1');

    const updated = applySsePayload(items, {
      type: 'done',
      sessionId: 'session-1',
      aborted: false,
    });

    const assistants = updated.filter((item) => item.kind === 'message' && item.role === 'assistant');
    expect(assistants).toHaveLength(1);
    const assistant = assistants[0];
    if (assistant?.kind === 'message') {
      expect(assistant.status).toBe('streaming');
      expect(assistant.content).toBe('');
    }
  });

  it('ignores premature done with mismatched messageId when optimistic assistant is still empty', () => {
    const items = appendPrompt([], 'hello', 'turn-1');

    const updated = applySsePayload(items, {
      type: 'done',
      sessionId: 'session-1',
      messageId: 'old-turn-id',
      aborted: false,
    });

    const assistants = updated.filter((item) => item.kind === 'message' && item.role === 'assistant');
    expect(assistants).toHaveLength(1);
    const assistant = assistants[0];
    if (assistant?.kind === 'message') {
      expect(assistant.status).toBe('streaming');
      expect(assistant.content).toBe('');
      expect(assistant.messageId).toBe('turn-1');
    }
  });

  it('does not create duplicate assistant when done arrives before chunks', () => {
    const optimistic = appendPrompt([], 'hello', 'turn-1');
    const afterDone = applySsePayload(optimistic, {
      type: 'done',
      sessionId: 'session-1',
      messageId: 'turn-1',
      aborted: false,
    });

    const afterChunk = applySsePayload(afterDone, {
      type: 'text_chunk',
      sessionId: 'session-1',
      messageId: 'backend-turn-1',
      content: 'ciao',
    });

    const assistants = afterChunk.filter((item) => item.kind === 'message' && item.role === 'assistant');
    expect(assistants).toHaveLength(1);
    const assistant = assistants[0];
    if (assistant?.kind === 'message') {
      expect(assistant.content).toContain('ciao');
      // messageId is preserved to keep the thinking and assistant paired.
      expect(assistant.messageId).toBe('turn-1');
    }
  });

  it('reuses placeholder assistant with transient Working text instead of appending duplicate', () => {
    const optimistic = appendPrompt([], 'hello', 'turn-1').map((item) => {
      if (item.kind === 'message' && item.role === 'assistant') {
        return { ...item, content: 'Working · 272k ctx window', status: 'streaming' as const };
      }
      return item;
    });

    const afterChunk = applySsePayload(optimistic, {
      type: 'text_chunk',
      sessionId: 'session-1',
      messageId: 'backend-turn-1',
      content: 'ciao',
    });

    const assistants = afterChunk.filter((item) => item.kind === 'message' && item.role === 'assistant');
    expect(assistants).toHaveLength(1);
    const assistant = assistants[0];
    if (assistant?.kind === 'message') {
      expect(assistant.content).toContain('ciao');
      // messageId is preserved to keep the thinking and assistant paired.
      expect(assistant.messageId).toBe('turn-1');
    }
  });

  it('keeps the running assistant attached to the last user when the user has no messageId yet', () => {
    const conversation = [
      {
        kind: 'message' as const,
        id: 'user-1',
        role: 'user' as const,
        content: 'hello',
        timestamp: '2026-04-30T16:00:00.000Z',
        status: 'complete' as const,
      },
    ];

    const rehydrated = rehydrateConversationForSession(conversation, 'busy');
    const turn = rehydrated.find((item) => item.kind === 'message' && item.role === 'assistant');

    expect(turn?.kind).toBe('message');
    if (turn?.kind === 'message') {
      expect(turn.messageId).toBe('user-1');
    }
  });
});
