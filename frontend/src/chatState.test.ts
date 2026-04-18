import { describe, expect, it } from 'vitest';
import { appendPrompt, applySsePayload, messagesToConversation, type ConversationItem } from './chatState';

describe('chatState', () => {
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

  it('appends a prompt with an assistant draft', () => {
    const conversation = appendPrompt([], 'write tests');

    expect(conversation).toHaveLength(2);
    expect(conversation[0]).toEqual(expect.objectContaining({ role: 'user', content: 'write tests' }));
    expect(conversation[1]).toEqual(expect.objectContaining({ role: 'assistant', status: 'streaming' }));
  });

  it('applies sse payloads for streaming text, tools, and completion', () => {
    let conversation: ConversationItem[] = appendPrompt([], 'hello');
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
      result: 'done',
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
    expect(conversation.find((item) => item.kind === 'message' && item.role === 'assistant')).toEqual(
      expect.objectContaining({ status: 'complete', content: 'Hi' }),
    );
  });
});
