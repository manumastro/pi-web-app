import { describe, expect, it } from 'vitest';
import { applySsePayload, appendPrompt, type ConversationItem } from './conversation';

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
});
