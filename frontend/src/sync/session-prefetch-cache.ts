const SESSION_PREFETCH_TTL = 15_000;

type PrefetchMeta = {
  limit: number;
  cursor?: string;
  complete: boolean;
  at: number;
};

const compositeKey = (directory: string, sessionID: string) => `${directory}\n${sessionID}`;

const cache = new Map<string, PrefetchMeta>();
const inflight = new Map<string, Promise<PrefetchMeta | undefined>>();
const rev = new Map<string, number>();

const version = (id: string) => rev.get(id) ?? 0;

export function shouldSkipSessionPrefetch(input: {
  hasMessages: boolean;
  info?: PrefetchMeta;
  pageSize: number;
  now?: number;
}): boolean {
  if (input.hasMessages) {
    if (!input.info) {
      return true;
    }
    if (input.info.complete) {
      return true;
    }
    if (input.info.limit > input.pageSize) {
      return true;
    }
  } else if (!input.info) {
    return false;
  }

  return (input.now ?? Date.now()) - input.info!.at < SESSION_PREFETCH_TTL;
}

export function getSessionPrefetch(directory: string, sessionID: string): PrefetchMeta | undefined {
  return cache.get(compositeKey(directory, sessionID));
}

export function getSessionPrefetchPromise(directory: string, sessionID: string): Promise<PrefetchMeta | undefined> | undefined {
  return inflight.get(compositeKey(directory, sessionID));
}

export function isSessionPrefetchCurrent(directory: string, sessionID: string, value: number): boolean {
  return version(compositeKey(directory, sessionID)) === value;
}

export function runSessionPrefetch(input: {
  directory: string;
  sessionID: string;
  task: (value: number) => Promise<PrefetchMeta | undefined>;
}): Promise<PrefetchMeta | undefined> {
  const id = compositeKey(input.directory, input.sessionID);
  const pending = inflight.get(id);
  if (pending) {
    return pending;
  }

  const value = version(id);
  const promise = input.task(value).finally(() => {
    if (inflight.get(id) === promise) {
      inflight.delete(id);
    }
  });

  inflight.set(id, promise);
  return promise;
}

export function setSessionPrefetch(input: {
  directory: string;
  sessionID: string;
  limit: number;
  cursor?: string;
  complete: boolean;
  at?: number;
}): void {
  cache.set(compositeKey(input.directory, input.sessionID), {
    limit: input.limit,
    cursor: input.cursor,
    complete: input.complete,
    at: input.at ?? Date.now(),
  });
}

export function clearSessionPrefetch(directory: string, sessionIDs: Iterable<string>): void {
  for (const sessionID of sessionIDs) {
    if (!sessionID) {
      continue;
    }
    const id = compositeKey(directory, sessionID);
    rev.set(id, version(id) + 1);
    cache.delete(id);
    inflight.delete(id);
  }
}

export function clearSessionPrefetchDirectory(directory: string): void {
  const prefix = `${directory}\n`;
  const keys = new Set([...cache.keys(), ...inflight.keys()]);
  for (const id of keys) {
    if (!id.startsWith(prefix)) {
      continue;
    }
    rev.set(id, version(id) + 1);
    cache.delete(id);
    inflight.delete(id);
  }
}
