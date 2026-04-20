import type { SessionInfo, StreamingState } from '@/types';
import { applySsePayload, type ConversationItem, type SsePayload } from '@/chatState';
import { getSessionStatusType, isRunningSessionStatus } from './sessionActivity';
import { getDirectoryState, getSyncChildStores } from './sync-refs';
import type { SyncSessionStatus } from './types';

export interface SessionLifecycleReducerDeps {
  directory?: string;
  setConversation: (items: ConversationItem[]) => void;
  updateSession: (id: string, updates: Partial<SessionInfo>) => void;
  setStreaming: (state: StreamingState) => void;
  setStatusMessage: (message: string) => void;
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
  return { type: 'idle', timestamp: Date.now() };
}

export function reduceSessionLifecyclePayload(
  currentConversation: ConversationItem[],
  payload: SsePayload,
  deps: SessionLifecycleReducerDeps,
): ConversationItem[] {
  const updatedConversation = applySsePayload(currentConversation, payload);
  deps.setConversation(updatedConversation);

  const nextStatus = transitionStatusForPayload(payload);
  patchSessionStatus(deps.directory, payload.sessionId, nextStatus);

  if (payload.type === 'done') {
    deps.updateSession(payload.sessionId, { status: 'idle' });
    deps.setStreaming('idle');
    deps.setStatusMessage(payload.aborted ? 'Stopped' : 'Connected');
  } else if (payload.type === 'error') {
    deps.updateSession(payload.sessionId, { status: 'error' });
    deps.setStreaming('error');
    deps.setStatusMessage('Error');
  } else if (isRunningSessionStatus(getSessionStatusType(nextStatus))) {
    deps.setStreaming('streaming');
  }

  patchSessionMessages(deps.directory, payload.sessionId, updatedConversation);
  return updatedConversation;
}
