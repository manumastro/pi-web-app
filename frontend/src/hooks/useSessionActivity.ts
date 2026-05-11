import React from 'react';
import type { Message, SessionStatus } from '@opencode-ai/sdk/v2';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionStatus, useSessionMessages, useSessionPermissions, useSessionQuestions } from '@/sync/sync-context';

// Mirrors OpenCode SessionStatus: busy|retry|idle (+ prompting while user input is required).
export type SessionActivityPhase = 'idle' | 'busy' | 'retry' | 'prompting';

export interface SessionActivityResult {
  phase: SessionActivityPhase;
  isWorking: boolean;
  isBusy: boolean;
  isCooldown: boolean;
}

const IDLE_RESULT: SessionActivityResult = {
  phase: 'idle',
  isWorking: false,
  isBusy: false,
  isCooldown: false,
};

export type SessionActivityInput = {
  sessionId: string | null | undefined;
  status?: SessionStatus;
  messages: Message[];
  hasPendingPrompt: boolean;
};

function hasPendingAssistantMessage(messages: Message[]): boolean {
  const lastMessage = messages[messages.length - 1];
  return Boolean(
    lastMessage
    && lastMessage.role === 'assistant'
    && typeof (lastMessage as { time?: { completed?: number } }).time?.completed !== 'number',
  );
}

export function deriveSessionActivity(input: SessionActivityInput): SessionActivityResult {
  if (!input.sessionId) return IDLE_RESULT;

  const hasPendingAssistant = hasPendingAssistantMessage(input.messages);

  if (input.hasPendingPrompt) {
    return {
      phase: 'prompting',
      isWorking: true,
      isBusy: false,
      isCooldown: false,
    };
  }

  const phase: SessionActivityPhase = (input.status?.type ?? 'idle') as SessionActivityPhase;
  const hasAuthoritativeStatus = input.status !== undefined;
  const statusWorking = hasAuthoritativeStatus && phase !== 'idle';

  if (statusWorking) {
    return {
      phase,
      isWorking: true,
      isBusy: phase === 'busy',
      isCooldown: false,
    };
  }

  if (hasPendingAssistant) {
    return {
      phase: 'busy',
      isWorking: true,
      isBusy: true,
      isCooldown: false,
    };
  }

  return IDLE_RESULT;
}

/**
 * Determines if a session is actively working.
 * Uses session.status as the primary source, but keeps the session busy while
 * the trailing assistant message is still incomplete or a prompt is pending.
 */
export function useSessionActivity(sessionId: string | null | undefined, directory?: string): SessionActivityResult {
  const status = useSessionStatus(sessionId ?? '', directory);
  const messages = useSessionMessages(sessionId ?? '', directory);
  const permissions = useSessionPermissions(sessionId ?? '', directory);
  const questions = useSessionQuestions(sessionId ?? '', directory);

  return React.useMemo<SessionActivityResult>(() => {
    return deriveSessionActivity({
      sessionId,
      status,
      messages,
      hasPendingPrompt: permissions.length > 0 || questions.length > 0,
    });
  }, [sessionId, status, messages, permissions.length, questions.length]);
}

export function useCurrentSessionActivity(): SessionActivityResult {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  return useSessionActivity(currentSessionId);
}
