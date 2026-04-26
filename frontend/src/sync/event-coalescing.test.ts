import { describe, expect, it } from 'vitest';
import { coalesceSsePayloads, createSeenEventIdWindow } from './event-coalescing';
import type { SsePayload } from './conversation';

describe('event coalescing', () => {
  it('drops duplicate SSE events by event id', () => {
    const seen = createSeenEventIdWindow();
    const payload: SsePayload = { type: 'text_chunk', sessionId: 's1', messageId: 'm1', content: 'Hi', __eventId: '1' };

    expect(coalesceSsePayloads([payload], seen)).toHaveLength(1);
    expect(coalesceSsePayloads([payload], seen)).toHaveLength(0);
  });

  it('merges adjacent text chunks for the same session turn', () => {
    const result = coalesceSsePayloads([
      { type: 'text_chunk', sessionId: 's1', messageId: 'm1', content: 'Hel', __eventId: '1' },
      { type: 'text_chunk', sessionId: 's1', messageId: 'm1', content: 'lo', __eventId: '2' },
      { type: 'done', sessionId: 's1', messageId: 'm1', __eventId: '3' },
    ], createSeenEventIdWindow());

    expect(result).toEqual([
      expect.objectContaining({ type: 'text_chunk', content: 'Hello' }),
      expect.objectContaining({ type: 'done' }),
    ]);
  });

  it('does not merge text chunks from different turns', () => {
    const result = coalesceSsePayloads([
      { type: 'text_chunk', sessionId: 's1', messageId: 'm1', content: 'A' },
      { type: 'text_chunk', sessionId: 's1', messageId: 'm2', content: 'B' },
    ]);

    expect(result).toHaveLength(2);
  });
});
