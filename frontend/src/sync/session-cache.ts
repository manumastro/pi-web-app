import type { SyncDirectoryState } from './types';

export function dropSessionCaches(store: SyncDirectoryState, sessionIDs: Iterable<string>): void {
  const stale = new Set(Array.from(sessionIDs).filter(Boolean));
  if (stale.size === 0) {
    return;
  }

  for (const sessionID of stale) {
    delete store.message[sessionID];
    delete store.todo[sessionID];
    delete store.session_diff[sessionID];
    delete store.session_status[sessionID];
    delete store.permission[sessionID];
    delete store.question[sessionID];
  }
}

export function pickSessionCacheEvictions(input: {
  seen: Set<string>;
  keep: string;
  limit: number;
  preserve?: Iterable<string>;
}): string[] {
  const stale: string[] = [];
  const keep = new Set([input.keep, ...Array.from(input.preserve ?? [])]);

  if (input.seen.has(input.keep)) {
    input.seen.delete(input.keep);
  }
  input.seen.add(input.keep);

  for (const id of input.seen) {
    if (input.seen.size - stale.length <= input.limit) {
      break;
    }
    if (keep.has(id)) {
      continue;
    }
    stale.push(id);
  }

  for (const id of stale) {
    input.seen.delete(id);
  }

  return stale;
}
