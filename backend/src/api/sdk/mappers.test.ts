import { describe, expect, it } from 'vitest';
import { getExternalMessageId, toSdkMessageInfo, toSdkParts } from './mappers.js';
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

  it('uses internal id for assistant messages to avoid ID collisions', () => {
    const msg = createMessage({
      id: 'assistant-internal-id',
      role: 'assistant',
      messageId: 'client-msg-id',
    });

    expect(getExternalMessageId(msg)).toBe('assistant-internal-id');

    const info = toSdkMessageInfo(createSession([msg]), msg);
    expect(info.id).toBe('assistant-internal-id');
    expect(info.providerID).toBe('openai-codex');
    expect(info.modelID).toBe('gpt-5.4-mini');
    expect(info.path).toEqual({ cwd: '/repo', root: '/repo' });

    const parts = toSdkParts('session-1', msg);
    expect(parts[0]?.messageID).toBe('assistant-internal-id');
    expect(parts[0]?.id).toBe('assistant-internal-id-text');
  });

  it('falls back to internal id when messageId is missing', () => {
    const msg = createMessage({ id: 'internal-only', messageId: undefined });

    expect(getExternalMessageId(msg)).toBe('internal-only');

    const info = toSdkMessageInfo(createSession([msg]), msg);
    expect(info.id).toBe('internal-only');
  });
});
