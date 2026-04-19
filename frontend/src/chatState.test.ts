import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendPrompt, applySsePayload, messagesToConversation, type ConversationItem } from './chatState';

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

  it('appends a prompt with thinking above the assistant draft', () => {
    const conversation = appendPrompt([], 'write tests');

    expect(conversation).toHaveLength(3);
    expect(conversation[0]).toEqual(expect.objectContaining({ role: 'user', content: 'write tests' }));
    expect(conversation[1]).toEqual(expect.objectContaining({ kind: 'thinking', content: 'thinking…', done: false }));
    expect(conversation[2]).toEqual(expect.objectContaining({ role: 'assistant', status: 'streaming' }));
  });

  it('falls back when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    const conversation = appendPrompt([], 'fallback ids');

    expect(conversation[0]?.id).toMatch(/^user-/);
    expect(conversation[1]?.kind).toBe('thinking');
  });

  it('applies sse payloads for streaming text, tools, completion and interactions', () => {
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
      type: 'question',
      sessionId: 's1',
      questionId: 'q1',
      question: 'Proceed?',
      options: ['yes', 'no'],
    });
    conversation = applySsePayload(conversation, {
      type: 'permission',
      sessionId: 's1',
      permissionId: 'p1',
      action: 'write',
      resource: '/tmp/file',
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
      result: 'done',
      success: true,
    });
    conversation = applySsePayload(conversation, {
      type: 'done',
      sessionId: 's1',
      messageId: 'a1',
      aborted: false,
    });

    expect(conversation.some((item) => item.kind === 'question')).toBe(true);
    expect(conversation.some((item) => item.kind === 'permission')).toBe(true);
    expect(conversation.some((item) => item.kind === 'tool_call')).toBe(true);
    expect(conversation.some((item) => item.kind === 'tool_result')).toBe(true);
    expect(conversation[1]).toEqual(
      expect.objectContaining({ kind: 'thinking', messageId: 'a1', done: true }),
    );
    expect(conversation[1]).toEqual(
      expect.objectContaining({ content: expect.stringContaining('Reasoning part 1') }),
    );
    expect(conversation[2]).toEqual(
      expect.objectContaining({ kind: 'message', role: 'assistant', messageId: 'a1', status: 'complete', content: 'Hi' }),
    );
  });
});
