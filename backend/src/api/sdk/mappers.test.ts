import { describe, expect, it } from 'vitest';
import { getExternalMessageId, toSdkMessageInfo, toSdkMessages, toSdkParts } from './mappers.js';
import type { Message, Session } from '../../sessions/store.js';

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: 'internal-id',
    role: 'user',
    content: 'hello',
    timestamp: '2026-05-02T12:00:00.000Z',
    ...overrides,
  };
}

function createSession(messages: Message[]): Session {
  return {
    id: 'session-1',
    cwd: '/repo',
    model: 'openai-codex/gpt-5.4-mini',
    status: 'idle',
    messages,
    createdAt: '2026-05-02T12:00:00.000Z',
    updatedAt: '2026-05-02T12:00:00.000Z',
  };
}

describe('sdk mappers', () => {
  it('prefers messageId over internal id for external API identity', () => {
    const msg = createMessage({ id: 'internal', messageId: 'client-msg-id' });

    expect(getExternalMessageId(msg)).toBe('client-msg-id');

    const info = toSdkMessageInfo(createSession([msg]), msg);
    expect(info.id).toBe('client-msg-id');
    expect(info.model).toEqual({ providerID: 'openai-codex', modelID: 'gpt-5.4-mini' });
    expect(info.agent).toBe('build');

    const parts = toSdkParts('session-1', msg);
    expect(parts[0]?.messageID).toBe('client-msg-id');
    expect(parts[0]?.id).toBe('client-msg-id-text');
  });

  it('uses separate client-visible id for assistant messages', () => {
    const msg = createMessage({
      id: 'assistant-internal-id',
      role: 'assistant',
      messageId: 'client-msg-id',
    });

    expect(getExternalMessageId(msg)).toBe('client-msg-id');

    const info = toSdkMessageInfo(createSession([msg]), msg);
    expect(info.id).toBe('client-msg-id');
    expect(info.providerID).toBe('openai-codex');
    expect(info.modelID).toBe('gpt-5.4-mini');
    expect(info.path).toEqual({ cwd: '/repo', root: '/repo' });

    const parts = toSdkParts('session-1', msg);
    expect(parts[0]?.messageID).toBe('client-msg-id');
    expect(parts[0]?.id).toBe('client-msg-id-text');
  });

  it('falls back to internal id when messageId is missing', () => {
    const msg = createMessage({ id: 'internal-only', messageId: undefined });

    expect(getExternalMessageId(msg)).toBe('internal-only');

    const info = toSdkMessageInfo(createSession([msg]), msg);
    expect(info.id).toBe('internal-only');
  });

  it('attaches persisted tool calls and results to the assistant message', () => {
    const messages = [
      createMessage({ id: 'u1', role: 'user', content: 'search', messageId: 'msg-1' }),
      createMessage({
        id: 'tc1',
        role: 'tool_call',
        content: '{"query":"serie a"}',
        messageId: 'msg-1_assistant',
        toolName: 'web_search',
        toolCallId: 'call-1',
      }),
      createMessage({
        id: 'tr1',
        role: 'tool_result',
        content: 'result text',
        messageId: 'msg-1_assistant',
        toolCallId: 'call-1',
        success: true,
      }),
      createMessage({ id: 'a1', role: 'assistant', content: 'answer', messageId: 'msg-1_assistant' }),
    ];

    const mapped = toSdkMessages(createSession(messages));
    const assistant = mapped.find((message) => message.info.role === 'assistant');
    expect(assistant?.info.id).toBe('msg-1_assistant');
    expect(assistant?.parts[0]).toMatchObject({
      id: 'msg-1_assistant-call-1',
      type: 'tool',
      tool: 'web_search',
      state: { status: 'completed', output: 'result text', title: 'web_search' },
    });
    expect(assistant?.parts.at(-1)).toMatchObject({ type: 'text', text: 'answer' });
  });
});
