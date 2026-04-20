import type { SessionInfo, StreamingState } from '@/types';
import { applySsePayload, type ConversationItem, type SsePayload } from '@/chatState';

export interface SessionLifecycleReducerDeps {
  setConversation: (items: ConversationItem[]) => void;
  updateSession: (id: string, updates: Partial<SessionInfo>) => void;
  setStreaming: (state: StreamingState) => void;
  setStatusMessage: (message: string) => void;
}

export function reduceSessionLifecyclePayload(
  currentConversation: ConversationItem[],
  payload: SsePayload,
  deps: SessionLifecycleReducerDeps,
): ConversationItem[] {
  const updatedConversation = applySsePayload(currentConversation, payload);
  deps.setConversation(updatedConversation);

  if (payload.type === 'done') {
    deps.updateSession(payload.sessionId, { status: 'idle' });
    deps.setStreaming('idle');
    deps.setStatusMessage(payload.aborted ? 'Stopped' : 'Connected');
  } else if (payload.type === 'error') {
    deps.updateSession(payload.sessionId, { status: 'error' });
    deps.setStreaming('error');
    deps.setStatusMessage('Error');
  }

  return updatedConversation;
}
