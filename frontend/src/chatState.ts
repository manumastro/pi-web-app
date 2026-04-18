import type { SessionMessage } from './types';

export interface MessageItem {
  kind: 'message';
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  status?: 'streaming' | 'complete' | 'aborted';
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
  toolName: string;
  input: string;
  timestamp: string;
}

export interface ToolResultItem {
  kind: 'tool_result';
  id: string;
  toolCallId: string;
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
  type: 'text_chunk' | 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'done';
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
}

function randomId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toMessageItem(message: SessionMessage): MessageItem {
  return {
    kind: 'message',
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    status: 'complete',
  };
}

function lastMessageIndex(items: ConversationItem[], role: MessageItem['role']): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && item.kind === 'message' && item.role === role) {
      return index;
    }
  }
  return -1;
}

function updateLastAssistant(items: ConversationItem[], updater: (item: MessageItem) => MessageItem): ConversationItem[] {
  const index = lastMessageIndex(items, 'assistant');
  if (index < 0) {
    return items;
  }
  const item = items[index];
  if (!item || item.kind !== 'message') {
    return items;
  }
  const next = [...items];
  next[index] = updater(item);
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
  return messages.map(toMessageItem);
}

export function appendPrompt(conversation: ConversationItem[], text: string): ConversationItem[] {
  return [
    ...conversation,
    {
      kind: 'message',
      id: randomId('user'),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      status: 'complete',
    },
    {
      kind: 'message',
      id: randomId('assistant'),
      role: 'assistant',
      content: '',
      timestamp: 'streaming',
      status: 'streaming',
    },
  ];
}

function formatInput(input?: Record<string, unknown>): string {
  if (!input) {
    return '{}';
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return '[unserializable input]';
  }
}

export function applySsePayload(conversation: ConversationItem[], payload: SsePayload): ConversationItem[] {
  if (payload.type === 'text_chunk') {
    const chunk = payload.content ?? '';
    const index = lastMessageIndex(conversation, 'assistant');
    if (index < 0) {
      return [
        ...conversation,
        {
          kind: 'message',
          id: payload.messageId ?? randomId('assistant'),
          role: 'assistant',
          content: chunk,
          timestamp: 'streaming',
          status: 'streaming',
        },
      ];
    }

    const item = conversation[index];
    if (!item || item.kind !== 'message') {
      return conversation;
    }

    const next = [...conversation];
    next[index] = {
      ...item,
      content: `${item.content}${chunk}`,
      status: 'streaming',
      timestamp: 'streaming',
    };
    return next;
  }

  if (payload.type === 'thinking') {
    const messageId = payload.messageId ?? randomId('thinking');
    return upsertById(conversation, {
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
      toolName: payload.toolName ?? 'tool',
      input: formatInput(payload.input),
      timestamp: payload.timestamp ?? new Date().toISOString(),
    });
  }

  if (payload.type === 'tool_result') {
    const toolCallId = payload.toolCallId ?? randomId('tool-result');
    return upsertById(conversation, {
      kind: 'tool_result',
      id: `${toolCallId}-result`,
      toolCallId,
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
    return updateLastAssistant(conversation, (item) => ({
      ...item,
      status: payload.aborted ? 'aborted' : 'complete',
      timestamp: new Date().toISOString(),
    }));
  }

  return conversation;
}
