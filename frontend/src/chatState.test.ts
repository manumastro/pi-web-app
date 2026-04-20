import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendPrompt, applySsePayload, messagesToConversation, rehydrateConversationForSession, type ConversationItem } from './chatState';
import type { SessionMessage } from './types';

describe('chatState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps session messages into conversation items', () => {
    const conversation = messagesToConversation([
      { id: 'm1', role: 'user', content: 'hello', timestamp: '2026-04-15T10:00:00.000Z' },
      { id: 'm2', role: 'assistant', content: 'world', timestamp: '2026-04-15T10:00:01.000Z' },
    ]);

    expect(conversation).toEqual([
      expect.objectContaining({ kind: 'message', role: 'user', content: 'hello' }),
      expect.objectContaining({ kind: 'message', role: 'assistant', content: 'world' }),
    ]);
  });

  it('rehydrates a running session with a streaming assistant placeholder', () => {
    const conversation = rehydrateConversationForSession(
      [{ id: 'm1', role: 'user', content: 'hello', timestamp: '2026-04-15T10:00:00.000Z' }],
      'busy',
    );

    expect(conversation).toHaveLength(2);
    expect(conversation[1]).toEqual(expect.objectContaining({ kind: 'message', role: 'assistant', status: 'streaming', content: '' }));
  });

  it('splits assistant reasoning from the visible answer and keeps tool calls/results attached to the turn', () => {
    const conversation = messagesToConversation([
      { id: 'u1', role: 'user', content: 'hi', timestamp: '2026-04-15T10:00:00.000Z' },
      { id: 'a1', role: 'assistant', messageId: 'turn-1', content: 'I should answer briefly.\n\n\nHi! How can I help?', timestamp: '2026-04-15T10:00:01.000Z' },
      { id: 't1', role: 'tool_call', messageId: 'turn-1', toolName: 'bash', toolCallId: 'call-1', content: 'pwd', timestamp: '2026-04-15T10:00:02.000Z' },
      { id: 't2', role: 'tool_result', messageId: 'turn-1', toolCallId: 'call-1', content: '/home/manu', success: true, timestamp: '2026-04-15T10:00:03.000Z' },
      { id: 'a3', role: 'assistant', messageId: 'turn-1', content: 'The cwd is known now.\n\n\nSiamo in `/home/manu`.', timestamp: '2026-04-15T10:00:04.000Z' },
    ] as SessionMessage[]);

    expect(conversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'thinking', content: 'I should answer briefly.' }),
        expect.objectContaining({ kind: 'message', role: 'assistant', content: 'Hi! How can I help?' }),
        expect.objectContaining({ kind: 'tool_call', toolName: 'bash', input: 'pwd' }),
        expect.objectContaining({ kind: 'tool_result', toolCallId: 'call-1', result: '/home/manu' }),
        expect.objectContaining({ kind: 'thinking', content: 'The cwd is known now.' }),
        expect.objectContaining({ kind: 'message', role: 'assistant', content: 'Siamo in `/home/manu`.' }),
      ]),
    );

    expect(conversation.some((item) => item.kind === 'message' && item.id === 'a1')).toBe(true);
    expect(conversation.some((item) => item.kind === 'message' && item.id === 'a3')).toBe(true);
  });

  it('appends a prompt with thinking above the assistant draft', () => {
    const conversation = appendPrompt([], 'write tests');

    expect(conversation).toHaveLength(3);
    expect(conversation[0]).toEqual(expect.objectContaining({ role: 'user', content: 'write tests' }));
    expect(conversation[1]).toEqual(expect.objectContaining({ kind: 'thinking', content: '', done: false }));
    expect(conversation[2]).toEqual(expect.objectContaining({ role: 'assistant', status: 'streaming' }));
  });

  it('falls back when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    const conversation = appendPrompt([], 'fallback ids');

    expect(conversation[0]?.id).toMatch(/^user-/);
    expect(conversation[1]?.kind).toBe('thinking');
  });

  it('applies sse payloads for streaming text, tools and completion', () => {
    let conversation: ConversationItem[] = appendPrompt([], 'hello');
    conversation = applySsePayload(conversation, {
      type: 'thinking',
      sessionId: 's1',
      messageId: 'a1',
      content: 'Reasoning part 1',
      done: false,
    });
    conversation = applySsePayload(conversation, {
      type: 'thinking',
      sessionId: 's1',
      messageId: 'a1',
      content: ' + part 2',
      done: false,
    });
    conversation = applySsePayload(conversation, {
      type: 'text_chunk',
      sessionId: 's1',
      messageId: 'a1',
      content: 'Hi',
    });
    conversation = applySsePayload(conversation, {
      type: 'tool_call',
      sessionId: 's1',
      messageId: 'a1',
      toolCallId: 't1',
      toolName: 'read',
      input: { path: 'file.txt' },
    });
    conversation = applySsePayload(conversation, {
      type: 'tool_result',
      sessionId: 's1',
      messageId: 'a1',
      toolCallId: 't1',
      result: '{"content":[{"type":"text","text":"done"}]}',
      success: true,
    });
    conversation = applySsePayload(conversation, {
      type: 'done',
      sessionId: 's1',
      messageId: 'a1',
      aborted: false,
    });

    expect(conversation.some((item) => item.kind === 'tool_call')).toBe(true);
    expect(conversation.some((item) => item.kind === 'tool_result')).toBe(true);
    expect(conversation[1]).toEqual(
      expect.objectContaining({ kind: 'thinking', messageId: 'a1', done: true }),
    );
    expect(conversation[1]).toEqual(
      expect.objectContaining({ content: expect.stringContaining('Reasoning part 1') }),
    );
    expect(conversation.find((item) => item.kind === 'tool_call')).toEqual(
      expect.objectContaining({ kind: 'tool_call', messageId: 'a1', input: 'file.txt' }),
    );
    expect(conversation.find((item) => item.kind === 'tool_result')).toEqual(
      expect.objectContaining({ kind: 'tool_result', messageId: 'a1', result: '{"content":[{"type":"text","text":"done"}]}' }),
    );
    expect(conversation[2]).toEqual(
      expect.objectContaining({ kind: 'message', role: 'assistant', messageId: 'a1', status: 'complete', content: 'Hi' }),
    );
  });
});
