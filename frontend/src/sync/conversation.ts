import type { SessionMessage } from '@/types';
import { isRunningSessionStatus } from './sessionActivity';

export interface MessageItem {
  kind: 'message';
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  status?: 'streaming' | 'complete' | 'aborted' | 'error';
  messageId?: string;
  attachments?: SessionMessage['attachments'];
}

export interface ThinkingItem {
  kind: 'thinking';
  id: string;
  messageId: string;
  content: string;
  done: boolean;
  timestamp: string;
}

export interface ToolCallItem {
  kind: 'tool_call';
  id: string;
  toolCallId: string;
  messageId?: string;
  toolName: string;
  input: string;
  timestamp: string;
}

export interface ToolResultItem {
  kind: 'tool_result';
  id: string;
  toolCallId: string;
  messageId?: string;
  result: string;
  success: boolean;
  timestamp: string;
}

export interface ErrorItem {
  kind: 'error';
  id: string;
  message: string;
  category: string;
  recoverable: boolean;
  timestamp: string;
}

export type ConversationItem = MessageItem | ThinkingItem | ToolCallItem | ToolResultItem | ErrorItem;

export interface SsePayload {
  type: 'text_chunk' | 'thinking' | 'tool_call' | 'tool_result' | 'question' | 'permission' | 'status' | 'session_name' | 'error' | 'done';
  sessionId: string;
  messageId?: string;
  content?: string;
  aborted?: boolean;
  done?: boolean;
  toolCallId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  result?: string;
  success?: boolean;
  message?: string;
  category?: string;
  recoverable?: boolean;
  timestamp?: string;
  status?: string;
  title?: string;
  sessionName?: string;
  metadata?: Record<string, unknown>;
  /** Internal transport event id used for replay/reconnect deduplication. */
  __eventId?: string;
}

function randomId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toMessageItem(message: SessionMessage): MessageItem {
  return {
    kind: 'message',
    id: message.id,
    role: message.role as MessageItem['role'],
    content: message.content,
    timestamp: message.timestamp,
    status: 'complete',
    messageId: message.messageId,
    ...(message.attachments ? { attachments: message.attachments } : {}),
  };
}

function splitAssistantContent(content: string): { reasoning: string; answer: string } {
  const trimmed = content.trim();
  if (!trimmed) {
    return { reasoning: '', answer: '' };
  }

  // Persisted assistant messages should stay user-visible by default.
  // Reasoning traces are sourced from explicit thinking events, not inferred
  // by splitting normal multi-paragraph assistant text.
  return { reasoning: '', answer: trimmed };
}

function normalizeSessionRole(role: SessionMessage['role'] | string | undefined): 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result' | undefined {
  switch (role) {
    case 'user':
    case 'assistant':
    case 'system':
    case 'tool_call':
    case 'tool_result':
      return role;
    case 'toolCall':
      return 'tool_call';
    case 'toolResult':
      return 'tool_result';
    default:
      return undefined;
  }
}

function formatToolText(input: unknown, toolName?: string): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return '';
    }

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return formatToolText(JSON.parse(trimmed) as unknown, toolName);
      } catch {
        return input;
      }
    }

    return input;
  }

  if (typeof input !== 'object' || input === null) {
    return input ? String(input) : '';
  }

  const record = input as Record<string, unknown>;
  const normalizedToolName = (toolName ?? '').toLowerCase();
  const getString = (keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return undefined;
  };

  if (normalizedToolName === 'bash') {
    const command = getString(['command']);
    if (command) {
      return command;
    }
  }

  if (normalizedToolName === 'task') {
    const prompt = getString(['prompt']);
    if (prompt) {
      return prompt;
    }

    const description = getString(['description']);
    if (description) {
      return description;
    }
  }

  const preferred = getString(['text', 'content', 'message', 'output', 'stdout', 'result', 'query', 'path', 'filePath', 'file_path', 'command', 'description', 'prompt']);
  if (preferred) {
    return preferred;
  }

  const entries = Object.entries(record)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());
      const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `${label}: ${rendered}`;
    });

  if (entries.length === 1) {
    return entries[0]?.split(': ').slice(1).join(': ') ?? '';
  }

  return entries.join('\n');
}

function lastMessageIndex(
  items: ConversationItem[],
  role: MessageItem['role'],
  messageId?: string,
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.kind !== 'message' || item.role !== role) {
      continue;
    }
    if (!messageId || item.messageId === messageId) {
      return index;
    }
  }
  return -1;
}

function isAssistantPlaceholderContent(value: string): boolean {
  const text = value.trim();
  if (!text) return true;
  return /^(working|connecting|cli\s+idle)\b/i.test(text);
}

function updateLastAssistant(
  items: ConversationItem[],
  updater: (item: MessageItem) => MessageItem,
  messageId?: string,
): ConversationItem[] {
  const index = lastMessageIndex(items, 'assistant', messageId);
  if (index >= 0) {
    const item = items[index];
    if (item && item.kind === 'message') {
      const next = [...items];
      next[index] = updater({
        ...item,
        messageId: messageId ?? item.messageId,
      });
      return next;
    }
  }

  // Fallback: find the last streaming assistant when exact messageId fails.
  for (let idx = items.length - 1; idx >= 0; idx -= 1) {
    const entry = items[idx];
    if (entry && entry.kind === 'message' && entry.role === 'assistant' && entry.status === 'streaming') {
      const next = [...items];
      next[idx] = updater({
        ...entry as MessageItem,
        messageId: messageId ?? (entry as MessageItem).messageId,
      });
      return next;
    }
  }

  return items;
}

function lastThinkingIndex(items: ConversationItem[], messageId?: string): number {
  let fallbackIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.kind !== 'thinking') {
      continue;
    }
    if (fallbackIndex < 0) {
      fallbackIndex = index;
    }
    if (!messageId || item.messageId === messageId) {
      return index;
    }
  }
  return fallbackIndex;
}

function upsertThinkingBeforeAssistant(items: ConversationItem[], item: ThinkingItem): ConversationItem[] {
  const existingIndex = items.findIndex(
    (entry) => entry.kind === 'thinking' && (entry.id === item.id || entry.messageId === item.messageId),
  );
  if (existingIndex >= 0) {
    const next = [...items];
    const existing = next[existingIndex] as ThinkingItem;
    next[existingIndex] = {
      ...existing,
      messageId: item.messageId ?? existing.messageId,
      content: `${existing.content}${item.content}`,
      done: item.done || existing.done,
      timestamp: item.timestamp,
    };
    return next;
  }

  const fallbackThinkingIndex = lastThinkingIndex(items);
  if (fallbackThinkingIndex >= 0) {
    const next = [...items];
    const existing = next[fallbackThinkingIndex] as ThinkingItem;
    // Preserve the existing messageId (frontend turnId) even when the SSE
    // event carries a different backend messageId.  This keeps the thinking
    // item in the same buildRenderRecords turn as the assistant it was
    // optimistically paired with, avoiding a split turn and the visual
    // flicker that follows.
    next[fallbackThinkingIndex] = {
      ...existing,
      messageId: existing.messageId,
      content: `${existing.content}${item.content}`,
      done: item.done || existing.done,
      timestamp: item.timestamp,
    };
    return next;
  }

  const assistantIndex = lastMessageIndex(items, 'assistant', item.messageId);
  const next = [...items];
  if (assistantIndex >= 0) {
    next.splice(assistantIndex, 0, item);
    return next;
  }

  // No assistant with a matching messageId — append to the last turn by
  // finding the assistant message with the latest timestamp, then insert
  // before it (keeps thinking above the answer).
  const lastAssistantIndex = items.reduce<number>((best, entry, idx) => {
    if (entry.kind === 'message' && entry.role === 'assistant') {
      return idx > best ? idx : best;
    }
    return best;
  }, -1);

  if (lastAssistantIndex >= 0) {
    next.splice(lastAssistantIndex, 0, item);
    return next;
  }

  return [...items, item];
}

function markThinkingDone(items: ConversationItem[], messageId?: string): ConversationItem[] {
  const index = lastThinkingIndex(items, messageId);
  if (index < 0) {
    return items;
  }

  const next = [...items];
  const thinking = next[index] as ThinkingItem;
  next[index] = {
    ...thinking,
    messageId: messageId ?? thinking.messageId,
    done: true,
  };
  return next;
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index < 0) {
    return [...items, item];
  }
  const next = [...items];
  next[index] = item;
  return next;
}

export function messagesToConversation(messages: SessionMessage[]): ConversationItem[] {
  const conversation: ConversationItem[] = [];
  let activeTurnId: string | undefined;
  let lastToolCallId: string | undefined;
  const turnIdByToolCallId = new Map<string, string>();

  for (const message of messages) {
    const role = normalizeSessionRole(message.role);

    if (role === 'user' || role === 'system') {
      activeTurnId = undefined;
      lastToolCallId = undefined;
      conversation.push(toMessageItem(message));
      continue;
    }

    if (role === 'tool_call') {
      const turnId = message.messageId ?? activeTurnId ?? randomId('assistant-turn');
      activeTurnId = turnId;
      lastToolCallId = message.toolCallId ?? message.id;
      const resolvedToolCallId = message.toolCallId ?? message.id;
      turnIdByToolCallId.set(resolvedToolCallId, turnId);
      conversation.push({
        kind: 'tool_call',
        id: message.id,
        toolCallId: resolvedToolCallId,
        messageId: turnId,
        toolName: message.toolName ?? 'tool',
        input: formatToolText(message.content, message.toolName),
        timestamp: message.timestamp,
      });
      continue;
    }

    if (role === 'tool_result') {
      const resolvedToolCallId = message.toolCallId ?? lastToolCallId ?? message.id;
      const turnId = message.messageId
        ?? (typeof resolvedToolCallId === 'string' ? turnIdByToolCallId.get(resolvedToolCallId) : undefined)
        ?? activeTurnId
        ?? randomId('assistant-turn');

      const lastItem = conversation.at(-1);
      if (
        lastItem &&
        lastItem.kind === 'tool_result' &&
        lastItem.messageId === turnId &&
        lastItem.toolCallId === resolvedToolCallId &&
        lastItem.result === message.content
      ) {
        continue;
      }

      activeTurnId = turnId;
      if (typeof resolvedToolCallId === 'string') {
        turnIdByToolCallId.set(resolvedToolCallId, turnId);
      }
      conversation.push({
        kind: 'tool_result',
        id: `${message.id}-result`,
        toolCallId: resolvedToolCallId,
        messageId: turnId,
        result: message.content,
        success: message.success ?? true,
        timestamp: message.timestamp,
      });
      continue;
    }

    if (role === 'assistant') {
      const turnId = message.messageId ?? activeTurnId ?? randomId('assistant-turn');
      activeTurnId = turnId;
      const errorMessage = typeof message.errorMessage === 'string' ? message.errorMessage.trim() : '';
      const stopReason = typeof message.stopReason === 'string' ? message.stopReason.trim() : '';

      if (errorMessage || stopReason === 'error') {
        conversation.push({
          kind: 'error',
          id: message.id,
          message: errorMessage || message.content || 'Unknown error',
          category: 'runner',
          recoverable: false,
          timestamp: message.timestamp,
        });
        continue;
      }

      const { reasoning, answer } = splitAssistantContent(message.content);

      if (reasoning) {
        conversation.push({
          kind: 'thinking',
          id: `${message.id}-thinking`,
          messageId: turnId,
          content: reasoning,
          done: true,
          timestamp: message.timestamp,
        });
      }

      conversation.push({
        kind: 'message',
        id: message.id,
        role: 'assistant',
        content: answer || message.content,
        timestamp: message.timestamp,
        status: 'complete',
        messageId: turnId,
      });
      continue;
    }

    conversation.push(toMessageItem(message));
  }

  return conversation;
}

export function rehydrateConversationForSession(
  messages: SessionMessage[],
  sessionStatus?: string | null,
): ConversationItem[] {
  const conversation = messagesToConversation(messages);
  if (!isRunningSessionStatus(sessionStatus)) {
    return conversation;
  }

  const hasStreamingAssistant = conversation.some(
    (item) => item.kind === 'message' && item.role === 'assistant' && item.status === 'streaming',
  );
  if (hasStreamingAssistant) {
    return conversation;
  }

  let lastAssistantIndex = -1;
  let lastUserIndex = -1;

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const item = conversation[index];
    if (lastAssistantIndex === -1 && item.kind === 'message' && item.role === 'assistant') {
      lastAssistantIndex = index;
    }
    if (lastUserIndex === -1 && item.kind === 'message' && item.role === 'user') {
      lastUserIndex = index;
    }
    if (lastAssistantIndex !== -1 && lastUserIndex !== -1) {
      break;
    }
  }

  // If the latest visible turn already has assistant text, treat that last
  // assistant message as still streaming instead of creating a detached empty row.
  if (lastAssistantIndex >= 0 && lastAssistantIndex > lastUserIndex) {
    const assistant = conversation[lastAssistantIndex];
    if (assistant && assistant.kind === 'message' && assistant.role === 'assistant') {
      const next = [...conversation];
      next[lastAssistantIndex] = {
        ...assistant,
        status: 'streaming',
      };
      return next;
    }
  }

  const lastUser = lastUserIndex >= 0 ? conversation[lastUserIndex] : undefined;
  const latestTurnIdFromConversation = [...conversation].reverse().find((item) => {
    if (!('messageId' in item)) {
      return false;
    }
    const candidate = item.messageId;
    return typeof candidate === 'string' && candidate.trim().length > 0;
  });

  const assistantTurnId = (
    lastUser && lastUser.kind === 'message' && lastUser.role === 'user'
      ? lastUser.messageId ?? lastUser.id
      : undefined
  )
    ?? (latestTurnIdFromConversation && 'messageId' in latestTurnIdFromConversation ? latestTurnIdFromConversation.messageId : undefined)
    ?? randomId('assistant-turn');

  return [
    ...conversation,
    {
      kind: 'message',
      id: randomId('assistant'),
      role: 'assistant',
      content: '',
      timestamp: 'streaming',
      status: 'streaming',
      messageId: assistantTurnId,
    },
  ];
}

export function appendPrompt(conversation: ConversationItem[], text: string, turnId?: string, attachments?: SessionMessage['attachments']): ConversationItem[] {
  const assistantTurnId = turnId ?? randomId('assistant-turn');
  return [
    ...conversation,
    {
      kind: 'message',
      id: randomId('user'),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      status: 'complete',
      messageId: assistantTurnId,
      ...(attachments ? { attachments } : {}),
    },
    {
      kind: 'thinking',
      id: randomId('thinking'),
      messageId: assistantTurnId,
      content: '',
      done: false,
      timestamp: new Date().toISOString(),
    },
    {
      kind: 'message',
      id: randomId('assistant'),
      role: 'assistant',
      content: '',
      timestamp: 'streaming',
      status: 'streaming',
      messageId: assistantTurnId,
    },
  ];
}


export function applySsePayload(conversation: ConversationItem[], payload: SsePayload): ConversationItem[] {
  if (payload.type === 'text_chunk') {
    const chunk = payload.content ?? '';

    // Resolve messageId: prefer explicit payload messageId, fall back to the
    // last assistant in the conversation (handles out-of-order chunk delivery).
    const assistantIndex = lastMessageIndex(conversation, 'assistant', undefined);
    const resolvedMessageId = payload.messageId
      ?? (assistantIndex >= 0 ? (conversation[assistantIndex] as MessageItem).messageId : undefined);

    if (resolvedMessageId) {
      const index = lastMessageIndex(conversation, 'assistant', resolvedMessageId);
      if (index >= 0) {
        const item = conversation[index];
        if (item && item.kind === 'message') {
          const next = [...conversation];
          next[index] = {
            ...item,
            messageId: resolvedMessageId,
            content: `${item.content}${chunk}`,
            status: 'streaming',
            timestamp: 'streaming',
          };
          return next;
        }
      }

      // Fallback 1: assistant placeholder (empty / "working" content).
      {
        const fallbackIndex = [...conversation].reverse().findIndex(
          (entry) => entry.kind === 'message' && entry.role === 'assistant' && isAssistantPlaceholderContent(entry.content),
        );
        if (fallbackIndex >= 0) {
          const targetIndex = conversation.length - 1 - fallbackIndex;
          const item = conversation[targetIndex];
          if (item && item.kind === 'message') {
            const next = [...conversation];
            // Preserve the existing messageId (frontend turnId) so the
            // assistant stays in the same turn as its paired thinking item.
            next[targetIndex] = {
              ...item,
              messageId: item.messageId,
              content: `${item.content}${chunk}`,
              status: 'streaming',
              timestamp: 'streaming',
            };
            return next;
          }
        }
      }

      // Fallback 2: last streaming assistant (any content, same role/status).
      // Handles subsequent chunks when the first one updated the placeholder
      // but left the messageId unchanged (mismatched SSE → optimistic IDs).
      {
        for (let index = conversation.length - 1; index >= 0; index -= 1) {
          const entry = conversation[index];
          if (entry && entry.kind === 'message' && entry.role === 'assistant' && entry.status === 'streaming') {
            const next = [...conversation];
            next[index] = {
              ...entry,
              messageId: entry.messageId,
              content: `${entry.content}${chunk}`,
              status: 'streaming',
              timestamp: 'streaming',
            };
            return next;
          }
        }
      }
    }

    // No matching assistant — create a new one appended to the conversation.
    return [
      ...conversation,
      {
        kind: 'message',
        id: resolvedMessageId ?? randomId('assistant'),
        role: 'assistant',
        content: chunk,
        timestamp: 'streaming',
        status: 'streaming',
        messageId: resolvedMessageId,
      },
    ];
  }

  if (payload.type === 'thinking') {
    const messageId = payload.messageId ?? randomId('thinking');
    return upsertThinkingBeforeAssistant(conversation, {
      kind: 'thinking',
      id: messageId,
      messageId,
      content: payload.content ?? '',
      done: payload.done ?? false,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    });
  }

  if (payload.type === 'tool_call') {
    const toolCallId = payload.toolCallId ?? randomId('tool-call');
    return upsertById(conversation, {
      kind: 'tool_call',
      id: toolCallId,
      toolCallId,
      messageId: payload.messageId,
      toolName: payload.toolName ?? 'tool',
      input: formatToolText(payload.input, payload.toolName),
      timestamp: payload.timestamp ?? new Date().toISOString(),
    });
  }

  if (payload.type === 'tool_result') {
    const toolCallId = payload.toolCallId ?? randomId('tool-result');
    const existingToolCall = conversation.find(
      (item): item is ToolCallItem => item.kind === 'tool_call' && item.toolCallId === toolCallId,
    );
    const fallbackTurnId = existingToolCall?.messageId;

    // If the tool_result arrives before the tool_call (out of order delivery),
    // we still attach it using the toolCallId, and it will be grouped when the
    // tool_call itself is added. The turnId is derived from the existing
    // tool_call so both entries share the same turn in groupToolEntry.
    return upsertById(conversation, {
      kind: 'tool_result',
      id: `${toolCallId}-result`,
      toolCallId,
      messageId: payload.messageId ?? fallbackTurnId,
      result: payload.result ?? '',
      success: payload.success ?? true,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    });
  }

  if (payload.type === 'error') {
    return [
      ...conversation,
      {
        kind: 'error',
        id: randomId('error'),
        message: payload.message ?? 'Unknown error',
        category: payload.category ?? 'unknown',
        recoverable: payload.recoverable ?? false,
        timestamp: payload.timestamp ?? new Date().toISOString(),
      },
    ];
  }

  if (payload.type === 'done') {
    const assistantIndex = lastMessageIndex(conversation, 'assistant', payload.messageId);
    const currentAssistant = assistantIndex >= 0 ? conversation[assistantIndex] : undefined;

    // Ignore premature done when the targeted assistant placeholder is still empty:
    // text chunks for the same turn may arrive immediately after.
    if (currentAssistant && currentAssistant.kind === 'message' && currentAssistant.role === 'assistant' && isAssistantPlaceholderContent(currentAssistant.content)) {
      return conversation;
    }

    // Resolve which messageId to use for updating the assistant and marking thinking done.
    // If done has no messageId, derive it from the latest assistant messageId.
    const assistantMessageId = payload.messageId
      ?? (assistantIndex >= 0 ? (conversation[assistantIndex] as MessageItem).messageId : undefined);

    // Check fallback: if no exact match by messageId, check whether the last
    // streaming assistant is still an empty placeholder (premature done).
    if (assistantIndex < 0) {
      const fallbackIdx = lastMessageIndex(conversation, 'assistant');
      const fallbackAssistant = fallbackIdx >= 0 ? conversation[fallbackIdx] : undefined;
      if (fallbackAssistant && fallbackAssistant.kind === 'message' && isAssistantPlaceholderContent(fallbackAssistant.content)) {
        return conversation;
      }
    }

    return markThinkingDone(
      updateLastAssistant(conversation, (item) => ({
        ...item,
        status: payload.aborted ? 'aborted' : 'complete',
        timestamp: new Date().toISOString(),
      }), assistantMessageId),
      assistantMessageId,
    );
  }

  return conversation;
}
