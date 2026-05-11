import { describe, expect, it } from 'vitest';
import { toSdkGlobalEvent } from './event-mapper.js';
import type { Message, Session, SessionStore } from '../../sessions/store.js';

const emptyStore = {
  getSession: () => undefined,
} as unknown as SessionStore;

function createStore(messages: Message[]): SessionStore {
  const session: Session = {
    id: 'session-1',
    cwd: '/repo',
    model: 'openai-codex/gpt-5.4-mini',
    status: 'idle',
    messages,
    createdAt: '2026-05-02T12:00:00.000Z',
    updatedAt: '2026-05-02T12:00:00.000Z',
  };
  return { getSession: () => session } as unknown as SessionStore;
}

function message(overrides: Partial<Message>): Message {
  return {
    id: 'id',
    role: 'user',
    content: '',
    timestamp: '2026-05-02T12:00:00.000Z',
    ...overrides,
  };
}

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

  it('emits a text part for user messages on message.updated', () => {
    const store = createStore([
      message({ id: 'u1', role: 'user', content: 'ciao', messageId: 'msg-user-1' }),
    ]);

    const mapped = toSdkGlobalEvent({
      type: 'message_updated',
      sessionId: 'session-1',
      messageId: 'msg-user-1',
      timestamp: '2026-05-02T12:00:00.000Z',
    }, store);

    expect(mapped).toMatchObject([
      { type: 'message.updated', properties: { info: { id: 'msg-user-1', role: 'user' } } },
      {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'msg-user-1-text',
            messageID: 'msg-user-1',
            type: 'text',
            text: 'ciao',
          },
        },
      },
    ]);
  });

  it('finalizes the assistant message, not earlier tool records with the same external id', () => {
    const store = createStore([
      message({ id: 'u1', role: 'user', content: 'search', messageId: 'msg-1' }),
      message({ id: 'tc1', role: 'tool_call', content: '{}', messageId: 'msg-1_assistant', toolName: 'web_search', toolCallId: 'call-1' }),
      message({ id: 'tr1', role: 'tool_result', content: 'result', messageId: 'msg-1_assistant', toolCallId: 'call-1', success: true }),
      message({ id: 'a1', role: 'assistant', content: 'answer', messageId: 'msg-1_assistant' }),
    ]);

    const mapped = toSdkGlobalEvent({
      type: 'done',
      sessionId: 'session-1',
      messageId: 'msg-1_assistant',
      aborted: false,
      timestamp: '2026-05-02T12:00:01.000Z',
    }, store);

    expect(mapped).toMatchObject({
      type: 'session.idle',
      properties: { sessionID: 'session-1' },
    });
  });
});
