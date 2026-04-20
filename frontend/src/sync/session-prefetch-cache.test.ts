import { describe, expect, it } from 'vitest';
import {
  clearSessionPrefetch,
  getSessionPrefetch,
  runSessionPrefetch,
  setSessionPrefetch,
  shouldSkipSessionPrefetch,
} from './session-prefetch-cache';

describe('session prefetch cache', () => {
  it('stores and clears per-session prefetch metadata', () => {
    setSessionPrefetch({
      directory: '/demo',
      sessionID: 'session-1',
      limit: 10,
      complete: false,
      cursor: 'next',
      at: 123,
    });

    expect(getSessionPrefetch('/demo', 'session-1')).toMatchObject({ limit: 10, cursor: 'next', complete: false, at: 123 });

    clearSessionPrefetch('/demo', ['session-1']);
    expect(getSessionPrefetch('/demo', 'session-1')).toBeUndefined();
  });

  it('skips recent prefetches and deduplicates inflight tasks', async () => {
    const meta = { limit: 10, complete: true, at: Date.now() };
    expect(shouldSkipSessionPrefetch({ hasMessages: true, info: meta, pageSize: 10 })).toBe(true);

    const first = runSessionPrefetch({
      directory: '/demo',
      sessionID: 'session-2',
      task: async () => ({ limit: 5, complete: true, at: Date.now() }),
    });
    const second = runSessionPrefetch({
      directory: '/demo',
      sessionID: 'session-2',
      task: async () => ({ limit: 5, complete: true, at: Date.now() }),
    });

    expect(first).toBe(second);
    await first;
  });
});
