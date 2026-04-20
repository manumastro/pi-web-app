import type { SessionInfo } from '@/types';
import { rehydrateConversationForSession } from '@/chatState';
import { isRunningSessionStatus } from './sessionActivity';

export interface SessionBootstrapDeps {
  updateSession: (id: string, session: SessionInfo) => void;
  setConversation: (value: ReturnType<typeof rehydrateConversationForSession>) => void;
  setSelectedSessionId: (id: string) => void;
  setSelectedDirectory: (cwd: string) => void;
  setStreaming: (state: 'idle' | 'streaming' | 'connecting' | 'error') => void;
  setStatusMessage: (message: string) => void;
}

export function hydrateSelectedSessionSnapshot(
  session: SessionInfo,
  deps: Pick<SessionBootstrapDeps, 'updateSession' | 'setConversation' | 'setSelectedSessionId' | 'setSelectedDirectory' | 'setStreaming' | 'setStatusMessage'>,
): void {
  deps.updateSession(session.id, session);
  deps.setConversation(rehydrateConversationForSession(session.messages, session.status));
  deps.setSelectedSessionId(session.id);
  deps.setSelectedDirectory(session.cwd);
  deps.setStreaming(isRunningSessionStatus(session.status) ? 'streaming' : 'idle');
  deps.setStatusMessage(isRunningSessionStatus(session.status) ? 'Working' : 'Connected');
}

export function normalizeSelectedSessionConversation(session: SessionInfo) {
  return rehydrateConversationForSession(session.messages, session.status);
}
