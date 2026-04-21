import { create } from 'zustand';
import type { ConversationItem, SsePayload } from '@/sync/conversation';

export type StreamPhase = 'streaming' | 'cooldown' | 'completed';

export interface MessageStreamState {
  phase: StreamPhase;
  startedAt: number;
  lastUpdateAt: number;
  completedAt?: number;
}

interface StreamingStore {
  streamingMessageIds: Map<string, string | null>;
  messageStreamStates: Map<string, MessageStreamState>;
}

const COOLDOWN_MS = 800;
const completionTimers = new Map<string, number>();

export const useStreamingStore = create<StreamingStore>()(() => ({
  streamingMessageIds: new Map(),
  messageStreamStates: new Map(),
}));

function clearCompletionTimer(sessionId: string): void {
  const timer = completionTimers.get(sessionId);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    completionTimers.delete(sessionId);
  }
}

function setStreamingState(sessionId: string, messageId: string | null, state?: MessageStreamState): void {
  useStreamingStore.setState((current) => {
    const streamingMessageIds = new Map(current.streamingMessageIds);
    const messageStreamStates = new Map(current.messageStreamStates);
    streamingMessageIds.set(sessionId, messageId);
    if (messageId && state) {
      messageStreamStates.set(messageId, state);
    }
    return { streamingMessageIds, messageStreamStates };
  });
}

function detectLastAssistantMessageId(items: ConversationItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind === 'message' && item.role === 'assistant') {
      return item.messageId ?? item.id;
    }
  }
  return null;
}

function startStreaming(sessionId: string, messageId: string, now: number): void {
  clearCompletionTimer(sessionId);
  const existing = useStreamingStore.getState().messageStreamStates.get(messageId);
  setStreamingState(sessionId, messageId, {
    phase: 'streaming',
    startedAt: existing?.startedAt ?? now,
    lastUpdateAt: now,
  });
}

function startCooldown(sessionId: string, messageId: string, now: number): void {
  clearCompletionTimer(sessionId);
  const existing = useStreamingStore.getState().messageStreamStates.get(messageId);
  setStreamingState(sessionId, messageId, {
    phase: 'cooldown',
    startedAt: existing?.startedAt ?? now,
    lastUpdateAt: now,
    completedAt: now,
  });

  completionTimers.set(sessionId, window.setTimeout(() => {
    completionTimers.delete(sessionId);
    useStreamingStore.setState((current) => {
      const streamingMessageIds = new Map(current.streamingMessageIds);
      const messageStreamStates = new Map(current.messageStreamStates);
      const previous = messageStreamStates.get(messageId);
      if (previous) {
        messageStreamStates.set(messageId, {
          ...previous,
          phase: 'completed',
          completedAt: previous.completedAt ?? Date.now(),
        });
      }
      streamingMessageIds.set(sessionId, null);
      return { streamingMessageIds, messageStreamStates };
    });
  }, COOLDOWN_MS));
}

export function hydrateStreamingSession(sessionId: string, items: ConversationItem[], sessionStatus?: string | null): void {
  const messageId = detectLastAssistantMessageId(items);
  const now = Date.now();
  if (!messageId || sessionStatus !== 'busy') {
    clearCompletionTimer(sessionId);
    setStreamingState(sessionId, null);
    return;
  }

  startStreaming(sessionId, messageId, now);
}

export function applyStreamingPayloadState(sessionId: string, payload: SsePayload, items: ConversationItem[]): void {
  const now = Date.now();
  const currentMessageId = useStreamingStore.getState().streamingMessageIds.get(sessionId) ?? null;
  const resolvedMessageId = payload.messageId ?? currentMessageId ?? detectLastAssistantMessageId(items);

  if (payload.type === 'text_chunk' || payload.type === 'thinking' || payload.type === 'tool_call' || payload.type === 'tool_result') {
    if (resolvedMessageId) {
      startStreaming(sessionId, resolvedMessageId, now);
    }
    return;
  }

  if (payload.type === 'done' || payload.type === 'error') {
    if (resolvedMessageId) {
      startCooldown(sessionId, resolvedMessageId, now);
    } else {
      clearCompletionTimer(sessionId);
      setStreamingState(sessionId, null);
    }
  }
}

export function useStreamingSession(sessionId?: string | null): { activeMessageId: string | null; phase: StreamPhase | null } {
  const activeMessageId = useStreamingStore((state) => (sessionId ? state.streamingMessageIds.get(sessionId) ?? null : null));
  const phase = useStreamingStore((state) => {
    if (!sessionId) {
      return null;
    }
    const messageId = state.streamingMessageIds.get(sessionId);
    if (!messageId) {
      return null;
    }
    return state.messageStreamStates.get(messageId)?.phase ?? null;
  });

  return { activeMessageId, phase };
}
