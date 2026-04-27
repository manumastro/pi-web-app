import type { SessionInfo, StreamingState } from '@/types';
import { applySsePayload, type ConversationItem, type SsePayload } from '@/sync/conversation';
import { applyStreamingPayloadState } from './streaming';
import { appendNotification } from './notification-store';
import { getSessionStatusType, isRunningSessionStatus } from './sessionActivity';
import { getDirectoryState, getSyncChildStores } from './sync-refs';
import type { SyncSessionStatus } from './types';

export interface SessionLifecycleReducerDeps {
  directory?: string;
  setConversation: (items: ConversationItem[]) => void;
  updateSession: (id: string, updates: Partial<SessionInfo>) => void;
  setStreaming: (state: StreamingState) => void;
  setStatusMessage: (message: string) => void;
  setError?: (message: string) => void;
}

function patchSessionStatus(directory: string | undefined, sessionId: string, status: SyncSessionStatus): void {
  if (!directory) {
    return;
  }

  const childStores = getSyncChildStores();
  childStores.ensureChild(directory, { bootstrap: false });
  childStores.update(directory, (state) => ({
    ...state,
    session_status: {
      ...state.session_status,
      [sessionId]: status,
    },
  }));
}

function patchSessionMessages(directory: string | undefined, sessionId: string, nextConversation: ConversationItem[]): void {
  if (!directory) {
    return;
  }

  const current = getDirectoryState(directory);
  if (!current) {
    return;
  }

  const messages = nextConversation
    .filter((item): item is Extract<ConversationItem, { kind: 'message' }> => item.kind === 'message')
    .map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
      messageId: item.messageId,
      ...(item.status === 'streaming' ? {} : {}),
    }));

  getSyncChildStores().update(directory, (state) => ({
    ...state,
    message: {
      ...state.message,
      [sessionId]: messages,
    },
  }));
}

function patchSessionAttention(directory: string | undefined, sessionId: string, kind: 'permission' | 'question', payload: SsePayload): void {
  if (!directory) return;

  const childStores = getSyncChildStores();
  childStores.ensureChild(directory, { bootstrap: false });
  childStores.update(directory, (state) => ({
    ...state,
    [kind]: {
      ...state[kind],
      [sessionId]: [...(state[kind][sessionId] ?? []), payload],
    },
  }));
}

function clearResolvedQuestion(directory: string | undefined, sessionId: string, questionId: string): void {
  if (!directory) return;
  getSyncChildStores().update(directory, (state) => ({
    ...state,
    question: {
      ...state.question,
      [sessionId]: (state.question[sessionId] ?? []).filter((item) => {
        if (!item || typeof item !== 'object') return true;
        return (item as { questionId?: unknown }).questionId !== questionId;
      }),
    },
  }));
}

function transitionStatusForPayload(payload: SsePayload): SyncSessionStatus {
  if (payload.type === 'done') {
    return { type: 'idle', timestamp: Date.now() };
  }
  if (payload.type === 'error') {
    return { type: 'error', timestamp: Date.now(), message: payload.message };
  }
  if (payload.type === 'text_chunk' || payload.type === 'thinking' || payload.type === 'tool_call' || payload.type === 'tool_result') {
    return { type: 'busy', timestamp: Date.now() };
  }
  if (payload.type === 'permission') {
    return { type: 'waiting_permission', timestamp: Date.now(), message: payload.message };
  }
  if (payload.type === 'question') {
    return { type: 'waiting_question', timestamp: Date.now(), message: payload.message };
  }
  if (payload.type === 'status') {
    return { type: payload.status ?? 'busy', timestamp: Date.now(), message: payload.message, metadata: payload.metadata };
  }
  return { type: 'idle', timestamp: Date.now() };
}

export function reduceSessionLifecyclePayload(
  currentConversation: ConversationItem[],
  payload: SsePayload,
  deps: SessionLifecycleReducerDeps,
): ConversationItem[] {
  return reduceSessionLifecyclePayloads(currentConversation, [payload], deps);
}

export function reduceSessionLifecyclePayloads(
  currentConversation: ConversationItem[],
  payloads: SsePayload[],
  deps: SessionLifecycleReducerDeps,
): ConversationItem[] {
  if (payloads.length === 0) {
    return currentConversation;
  }

  let updatedConversation = currentConversation;
  for (const payload of payloads) {
    updatedConversation = applySsePayload(updatedConversation, payload);
    applyStreamingPayloadState(payload.sessionId, payload, updatedConversation);
  }

  deps.setConversation(updatedConversation);

  const finalPayload = payloads[payloads.length - 1]!;
  const nextStatus = transitionStatusForPayload(finalPayload);
  const nextStatusType = getSessionStatusType(nextStatus) ?? 'idle';
  patchSessionStatus(deps.directory, finalPayload.sessionId, nextStatus);

  if (finalPayload.type === 'permission' || finalPayload.type === 'question') {
    deps.updateSession(finalPayload.sessionId, { status: nextStatusType, updatedAt: finalPayload.timestamp ?? new Date().toISOString() });
    patchSessionAttention(deps.directory, finalPayload.sessionId, finalPayload.type, finalPayload);
    deps.setStreaming('streaming');
    deps.setStatusMessage(finalPayload.message ?? (finalPayload.type === 'permission' ? 'Permission needed' : 'Question pending'));
  } else if (finalPayload.type === 'status') {
    const resolvedQuestionId = typeof finalPayload.metadata?.resolvedQuestionId === 'string' ? finalPayload.metadata.resolvedQuestionId : '';
    if (resolvedQuestionId) {
      clearResolvedQuestion(deps.directory, finalPayload.sessionId, resolvedQuestionId);
    }
    const sessionName = typeof finalPayload.metadata?.sessionName === 'string' ? finalPayload.metadata.sessionName.trim() : '';
    deps.updateSession(finalPayload.sessionId, {
      status: nextStatusType,
      ...(sessionName ? { title: sessionName } : {}),
      updatedAt: finalPayload.timestamp ?? new Date().toISOString(),
    });
    deps.setStatusMessage(finalPayload.message ?? finalPayload.status ?? 'Working');
    if (isRunningSessionStatus(getSessionStatusType(nextStatus))) {
      deps.setStreaming('streaming');
    }
  } else if (finalPayload.type === 'done') {
    deps.updateSession(finalPayload.sessionId, { status: 'idle', updatedAt: finalPayload.timestamp ?? new Date().toISOString() });
    deps.setStreaming('idle');
    deps.setStatusMessage(finalPayload.aborted ? 'Stopped' : 'Connected');
    appendNotification({
      type: 'turn-complete',
      session: finalPayload.sessionId,
      directory: deps.directory,
      time: Date.now(),
      viewed: false,
    });
  } else if (finalPayload.type === 'error') {
    const message = finalPayload.message?.trim() || 'Unknown error';
    deps.updateSession(finalPayload.sessionId, { status: 'error', updatedAt: finalPayload.timestamp ?? new Date().toISOString() });
    deps.setStreaming('error');
    deps.setStatusMessage(message);
    deps.setError?.(message);
    appendNotification({
      type: 'error',
      session: finalPayload.sessionId,
      directory: deps.directory,
      time: Date.now(),
      viewed: false,
      error: {
        message: finalPayload.message,
      },
    });
  } else if (isRunningSessionStatus(nextStatusType)) {
    deps.updateSession(finalPayload.sessionId, { status: nextStatusType, updatedAt: finalPayload.timestamp ?? new Date().toISOString() });
    deps.setStreaming('streaming');
  }

  patchSessionMessages(deps.directory, finalPayload.sessionId, updatedConversation);
  return updatedConversation;
}
