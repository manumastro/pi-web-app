import type { SessionInfo, SessionMessage } from '@/types';

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sortMessages(messages: SessionMessage[]): SessionMessage[] {
  return [...messages].sort((left, right) => cmp(left.id, right.id));
}

export type OptimisticStore = {
  message: Record<string, SessionMessage[] | undefined>;
};

export type OptimisticItem = {
  message: SessionMessage;
  parts: unknown[];
};

export type OptimisticAddInput = {
  sessionID: string;
  message: SessionMessage;
  parts: unknown[];
};

export type OptimisticRemoveInput = {
  sessionID: string;
  messageID: string;
};

export type MessagePage = {
  session: SessionMessage[];
  part?: { id: string; part: unknown[] }[];
  cursor?: string;
  complete: boolean;
};

function mergeMessages<T extends { id: string }>(a: readonly T[], b: readonly T[]): T[] {
  const existing = new Map(a.map((item) => [item.id, item] as const));
  let changed = false;
  for (const item of b) {
    if (!existing.has(item.id)) {
      existing.set(item.id, item);
      changed = true;
    }
  }
  if (!changed) {
    return a as T[];
  }
  return [...existing.values()].sort((left, right) => cmp(left.id, right.id));
}

export function mergeOptimisticPage(page: MessagePage, items: OptimisticItem[]) {
  if (items.length === 0) {
    return { ...page, confirmed: [] as string[] };
  }

  const session = [...page.session];
  const confirmed: string[] = [];

  for (const item of items) {
    const existing = session.find((message) => message.id === item.message.id);
    if (!existing) {
      session.push(item.message);
      continue;
    }
    confirmed.push(item.message.id);
  }

  return {
    cursor: page.cursor,
    complete: page.complete,
    session: sortMessages(session),
    part: page.part ?? [],
    confirmed,
  };
}

export function applyOptimisticAdd(draft: OptimisticStore, input: OptimisticAddInput): void {
  const messages = draft.message[input.sessionID];
  if (messages) {
    if (!messages.some((entry) => entry.id === input.message.id)) {
      messages.push(input.message);
      draft.message[input.sessionID] = sortMessages(messages);
    }
  } else {
    draft.message[input.sessionID] = [input.message];
  }
}

export function applyOptimisticRemove(draft: OptimisticStore, input: OptimisticRemoveInput): void {
  const messages = draft.message[input.sessionID];
  if (!messages) {
    return;
  }
  draft.message[input.sessionID] = messages.filter((message) => message.id !== input.messageID);
}

export function mergeMessagesSorted<T extends { id: string }>(a: readonly T[], b: readonly T[]) {
  return mergeMessages(a, b);
}

export { mergeMessagesSorted as mergeMessages };

export function optimisticConversationFromSession(session: SessionInfo): SessionMessage[] {
  return [...session.messages];
}
