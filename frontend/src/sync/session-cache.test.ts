import { describe, expect, it } from 'vitest';
import { pickSessionCacheEvictions, dropSessionCaches } from './session-cache';
import type { SyncDirectoryState } from './types';

function makeState(): SyncDirectoryState {
  return {
    status: 'complete',
    session: [],
    session_status: {
      a: { type: 'busy' },
      b: { type: 'idle' },
    },
    message: {
      a: [{ id: 'a-1', role: 'user', content: 'a', timestamp: 't' }],
      b: [{ id: 'b-1', role: 'user', content: 'b', timestamp: 't' }],
    },
    session_diff: { a: [], b: [] },
    todo: { a: [], b: [] },
    permission: { a: [], b: [] },
    question: { a: [], b: [] },
    mcp: {},
    lsp: [],
    vcs: undefined,
    limit: 5,
  };
}

describe('session cache helpers', () => {
  it('drops cached data for stale sessions', () => {
    const state = makeState();
    dropSessionCaches(state, ['a']);
    expect(state.message.a).toBeUndefined();
    expect(state.session_status.a).toBeUndefined();
    expect(state.message.b).toBeDefined();
  });

  it('picks the oldest evictions when the cache overflows', () => {
    const seen = new Set(['one', 'two', 'three']);
    const stale = pickSessionCacheEvictions({ seen, keep: 'three', limit: 2 });
    expect(stale.length).toBe(1);
    expect(seen.has(stale[0] ?? '')).toBe(false);
  });
});
