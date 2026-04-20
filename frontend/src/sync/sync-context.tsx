import React from 'react';
import { useSessionStore } from '@/stores/sessionStore';
import { getSessionActivityResult } from './sessionActivity';
import type { SessionActivityResult } from './sessionActivity';

const EMPTY_MESSAGES: never[] = [];
const EMPTY_PERMISSIONS: never[] = [];

export function useSessionStatus(sessionID: string, directory?: string) {
  return useSessionStore((state) => {
    const session = state.sessions.find((entry) => entry.id === sessionID && (!directory || entry.cwd === directory));
    return state.sessionStatuses[session?.id ?? sessionID];
  });
}

export function useSessionMessages(sessionID: string, directory?: string) {
  return useSessionStore((state) => {
    const session = state.sessions.find((entry) => entry.id === sessionID && (!directory || entry.cwd === directory));
    return session?.messages ?? EMPTY_MESSAGES;
  });
}

export function useSessionPermissions(): unknown[] {
  return EMPTY_PERMISSIONS;
}

export function useSessionActivity(sessionId: string | null | undefined, directory?: string): SessionActivityResult {
  const status = useSessionStatus(sessionId ?? '', directory);
  const messages = useSessionMessages(sessionId ?? '', directory);
  const permissions = useSessionPermissions();

  return React.useMemo<SessionActivityResult>(() => {
    if (!sessionId) {
      return {
        phase: 'idle',
        isWorking: false,
        isBusy: false,
        isCooldown: false,
      };
    }

    if (permissions.length > 0) {
      return {
        phase: 'idle',
        isWorking: false,
        isBusy: false,
        isCooldown: false,
      };
    }

    const result = getSessionActivityResult(status);
    if (result.isWorking) {
      return result;
    }

    const lastMessage = messages[messages.length - 1];
    const hasPendingAssistant = Boolean(
      lastMessage
      && lastMessage.role === 'assistant'
      && typeof (lastMessage as { time?: { completed?: number } }).time?.completed !== 'number',
    );

    if (!hasPendingAssistant) {
      return result;
    }

    return {
      phase: 'busy',
      isWorking: true,
      isBusy: true,
      isCooldown: false,
    };
  }, [sessionId, status, messages, permissions.length]);
}

export function useCurrentSessionActivity(): SessionActivityResult {
  const currentSessionId = useSessionStore((state) => state.currentSession?.id);
  return useSessionActivity(currentSessionId);
}
