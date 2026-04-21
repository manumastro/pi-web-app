import { describe, expect, it } from 'vitest';
import type { SessionMessage } from '@/types';
import {
  applyOptimisticAdd,
  applyOptimisticRemove,
  mergeMessages,
  mergeOptimisticPage,
} from './optimistic';

describe('optimistic helpers', () => {
  it('merges optimistic pages and confirms existing messages', () => {
    const page = {
      session: [{ id: 'a', role: 'user' as const, content: 'a', timestamp: 't' } satisfies SessionMessage],
      complete: false,
      cursor: 'next',
    };
    const merged = mergeOptimisticPage(page, [
      { message: { id: 'b', role: 'assistant', content: 'b', timestamp: 't' }, parts: [] },
    ]);

    expect(merged.session.map((message) => message.id)).toEqual(['a', 'b']);
    expect(merged.confirmed).toEqual([]);
  });

  it('adds and removes optimistic messages in a draft store', () => {
    const draft = { message: {} as Record<string, SessionMessage[] | undefined> };
    applyOptimisticAdd(draft, {
      sessionID: 'session-1',
      message: { id: 'a', role: 'user' as const, content: 'hello', timestamp: 't' },
      parts: [],
    });
    expect(draft.message['session-1']).toHaveLength(1);

    applyOptimisticRemove(draft, { sessionID: 'session-1', messageID: 'a' });
    expect(draft.message['session-1']).toHaveLength(0);
  });

  it('keeps chronological order when optimistic ids are lexicographically out of order', () => {
    const page = {
      session: [
        { id: 'z-user', role: 'user' as const, content: 'first', timestamp: '2026-04-21T10:33:00.000Z' },
      ],
      complete: false,
      cursor: 'next',
    };

    const merged = mergeOptimisticPage(page, [
      {
        message: {
          id: 'a-assistant',
          role: 'assistant',
          content: 'second',
          timestamp: '2026-04-21T10:34:00.000Z',
        },
        parts: [],
      },
    ]);

    expect(merged.session.map((message) => message.id)).toEqual(['z-user', 'a-assistant']);
  });

  it('deduplicates sorted message arrays', () => {
    const merged = mergeMessages([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]);
    expect(merged.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});
