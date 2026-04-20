import type { SessionMessage } from '@/types';
import { isRunningSessionStatus } from './sessionActivity';

export interface MessageItem {
  kind: 'message';
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  status?: 'streaming' | 'complete' | 'aborted';
  messageId?: string;
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
  };
}

function splitAssistantContent(content: string): { reasoning: string; answer: string } {
  const trimmed = content.trim();
  if (!trimmed) {
    return { reasoning: '', answer: '' };
  }

  const parts = trimmed
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length <= 1) {
    return { reasoning: '', answer: trimmed };
  }

  return {
    reasoning: parts.slice(0, -1).join('\n\n'),
    answer: parts.at(-1) ?? '',
  };
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
  let fallbackIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.kind !== 'message' || item.role !== role) {
      continue;
    }

    fallbackIndex = index;
    if (!messageId || item.messageId === messageId) {
      return index;
    }
  }
  return fallbackIndex;
}

function updateLastAssistant(
  items: ConversationItem[],
  updater: (item: MessageItem) => MessageItem,
  messageId?: string,
): ConversationItem[] {
  const index = lastMessageIndex(items, 'assistant', messageId);
  if (index < 0) {
    return items;
  }
  const item = items[index];
  if (!item || item.kind !== 'message') {
    return items;
  }
  const next = [...items];
  next[index] = updater({
    ...item,
    messageId: messageId ?? item.messageId,
  });
  return next;
}

function lastThinkingIndex(items: ConversationItem[], messageId?: string): number {
  let fallbackIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.kind !== 'thinking') {
      continue;
    }
    fallbackIndex = index;
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
    next[fallbackThinkingIndex] = {
      ...existing,
      messageId: item.messageId ?? existing.messageId,
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
      conversation.push({
        kind: 'tool_call',
        id: message.id,
        toolCallId: message.toolCallId ?? message.id,
        messageId: turnId,
        toolName: message.toolName ?? 'tool',
        input: formatToolText(message.content, message.toolName),
        timestamp: message.timestamp,
      });
      continue;
    }

    if (role === 'tool_result') {
      const turnId = message.messageId ?? activeTurnId ?? randomId('assistant-turn');
      const lastItem = conversation.at(-1);
      if (
        lastItem &&
        lastItem.kind === 'tool_result' &&
        lastItem.messageId === turnId
      ) {
        continue;
      }

      activeTurnId = turnId;
      conversation.push({
        kind: 'tool_result',
        id: `${message.id}-result`,
        toolCallId: message.toolCallId ?? lastToolCallId ?? message.id,
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

  const assistantTurnId = randomId('assistant-turn');
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

export function appendPrompt(conversation: ConversationItem[], text: string, turnId?: string): ConversationItem[] {
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
    const index = lastMessageIndex(conversation, 'assistant', payload.messageId);
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
          messageId: payload.messageId,
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
      messageId: payload.messageId ?? item.messageId,
      content: `${item.content}${chunk}`,
      status: 'streaming',
      timestamp: 'streaming',
    };
    return next;
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
    return upsertById(conversation, {
      kind: 'tool_result',
      id: `${toolCallId}-result`,
      toolCallId,
      messageId: payload.messageId,
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
    return markThinkingDone(
      updateLastAssistant(conversation, (item) => ({
        ...item,
        status: payload.aborted ? 'aborted' : 'complete',
        timestamp: new Date().toISOString(),
      }), payload.messageId),
      payload.messageId,
    );
  }

  return conversation;
}
