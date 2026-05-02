import { describe, expect, it } from 'vitest';
import { toSdkGlobalEvent } from './event-mapper.js';
import type { SessionStore } from '../../sessions/store.js';

const emptyStore = {
  getSession: () => undefined,
} as unknown as SessionStore;

describe('sdk event mapper', () => {
  it('initializes text parts once and streams subsequent text as deltas', () => {
    const first = toSdkGlobalEvent({
      type: 'text_chunk',
      sessionId: 'session-stream-1',
      messageId: 'message-stream-1',
      content: 'Hel',
      timestamp: '2026-05-02T12:00:00.000Z',
    }, emptyStore);

    expect(Array.isArray(first)).toBe(true);
    expect(first).toMatchObject([
      {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'message-stream-1-text',
            messageID: 'message-stream-1',
            type: 'text',
            text: '',
          },
        },
      },
      {
        type: 'message.part.delta',
        properties: {
          messageID: 'message-stream-1',
          partID: 'message-stream-1-text',
          field: 'text',
          delta: 'Hel',
        },
      },
    ]);

    const second = toSdkGlobalEvent({
      type: 'text_chunk',
      sessionId: 'session-stream-1',
      messageId: 'message-stream-1',
      content: 'lo',
      timestamp: '2026-05-02T12:00:00.100Z',
    }, emptyStore);

    expect(second).toEqual({
      type: 'message.part.delta',
      properties: {
        messageID: 'message-stream-1',
        partID: 'message-stream-1-text',
        field: 'text',
        delta: 'lo',
      },
    });
  });
});
