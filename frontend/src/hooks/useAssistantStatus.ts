import { useMemo } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { useSessionPermissions, useSessionQuestions, useSessionStatus } from '@/sync/sync-context';
import { getSessionStatusType } from '@/sync/sessionActivity';
import { useStreamingSession, type StreamPhase } from '@/sync/streaming';
import type { ConversationItem } from '@/sync/conversation';

export type AssistantActivity = 'idle' | 'streaming' | 'tooling' | 'permission' | 'retry' | 'cooldown' | 'complete';

export interface AssistantStatusSnapshot {
  activity: AssistantActivity;
  label: string;
  statusText: string | null;
  isWorking: boolean;
  isStreaming: boolean;
  isCooldown: boolean;
  isWaitingForPermission: boolean;
  isRetry: boolean;
  isComplete: boolean;
  activeToolName?: string;
  lifecyclePhase: StreamPhase | null;
}

function summarizePreview(text: string, maxLength = 96): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function getLastAssistantRelatedItems(items: ConversationItem[]) {
  let activeToolName: string | undefined;
  let activeToolInput: string | undefined;
  let hasPendingTool = false;
  let hasAssistantText = false;
  let latestThinkingPreview: string | undefined;
  let latestAssistantPreview: string | undefined;
  const resolvedToolCallIds = new Set<string>();

  // Evaluate only the latest user→assistant turn (scan backwards until the last user message).
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item.kind === 'message' && item.role === 'user') {
      break;
    }

    if (item.kind === 'thinking' && !latestThinkingPreview && item.content.trim().length > 0) {
      latestThinkingPreview = summarizePreview(item.content);
      continue;
    }

    if (item.kind === 'tool_result') {
      resolvedToolCallIds.add(item.toolCallId);
      continue;
    }

    if (item.kind === 'tool_call') {
      if (!resolvedToolCallIds.has(item.toolCallId)) {
        hasPendingTool = true;
        if (!activeToolName) {
          activeToolName = item.toolName;
        }
        if (!activeToolInput && item.input.trim().length > 0) {
          activeToolInput = summarizePreview(item.input);
        }
      }
      continue;
    }

    if (item.kind === 'message' && item.role === 'assistant' && item.content.trim().length > 0) {
      hasAssistantText = true;
      if (!latestAssistantPreview) {
        latestAssistantPreview = summarizePreview(item.content);
      }
    }
  }

  return { activeToolName, activeToolInput, hasPendingTool, hasAssistantText, latestThinkingPreview, latestAssistantPreview };
}

export function useAssistantStatus(): AssistantStatusSnapshot {
  const conversation = useChatStore((state) => state.conversation);
  const selectedSessionId = useSessionUiStore((state) => state.selectedSessionId);
  const selectedDirectory = useSessionUiStore((state) => state.selectedDirectory);
  const currentSession = useSessionUiStore((state) => state.currentSession);
  const sessionStatus = useSessionStatus(selectedSessionId, selectedDirectory);
  const permissions = useSessionPermissions(selectedSessionId, selectedDirectory);
  const questions = useSessionQuestions(selectedSessionId, selectedDirectory);
  const streaming = useStreamingSession(selectedSessionId || undefined);

  return useMemo(() => {
    const statusType = getSessionStatusType(sessionStatus) ?? getSessionStatusType(currentSession?.status);
    const { activeToolName, activeToolInput, hasPendingTool, hasAssistantText, latestThinkingPreview, latestAssistantPreview } = getLastAssistantRelatedItems(conversation);
    const hasPermission = permissions.length > 0 || questions.length > 0 || statusType === 'waiting_permission' || statusType === 'waiting_question';
    const isRetry = statusType === 'retry';
    const isCooldown = streaming.phase === 'cooldown';
    const isStreaming = streaming.phase === 'streaming' || statusType === 'busy' || statusType === 'answering' || statusType === 'prompting';
    const isTooling = !hasPermission && !isRetry && !isCooldown && (
      statusType === 'tooling'
      || statusType === 'editing'
      || (hasPendingTool && isStreaming)
    );
    const isComplete = !hasPermission && !isRetry && !isCooldown && !isStreaming && !isTooling && hasAssistantText;
    const isThinking = Boolean(latestThinkingPreview) && !hasAssistantText;

    let activity: AssistantActivity = 'idle';
    if (hasPermission) {
      activity = 'permission';
    } else if (isRetry) {
      activity = 'retry';
    } else if (isCooldown) {
      activity = 'cooldown';
    } else if (isTooling) {
      activity = 'tooling';
    } else if (isThinking) {
      activity = 'streaming';
    } else if (isStreaming) {
      activity = 'streaming';
    } else if (isComplete) {
      activity = 'complete';
    }

    let label = 'Working...';
    let statusText: string | null = null;
    if (activity === 'permission') {
      label = statusType === 'waiting_question' ? 'Question pending...' : 'Permission needed...';
      statusText = sessionStatus?.message ?? null;
    } else if (activity === 'retry') {
      label = 'Retrying...';
      statusText = sessionStatus?.message ?? null;
    } else if (activity === 'cooldown') {
      label = 'Finalizing...';
      statusText = latestAssistantPreview ? `Wrapping up · ${latestAssistantPreview}` : sessionStatus?.message ?? null;
    } else if (activity === 'tooling') {
      label = activeToolName ? `Running ${activeToolName}...` : 'Running tools...';
      statusText = activeToolInput ? activeToolInput : sessionStatus?.message ?? null;
    } else if (isThinking) {
      label = 'Thinking...';
      statusText = latestThinkingPreview ? `Thinking · ${latestThinkingPreview}` : sessionStatus?.message ?? null;
    } else if (activity === 'streaming') {
      label = 'Writing...';
      statusText = latestAssistantPreview ? `Writing · ${latestAssistantPreview}` : sessionStatus?.message ?? null;
    } else if (activity === 'complete') {
      label = 'Complete';
      statusText = latestAssistantPreview ? `Done · ${latestAssistantPreview}` : null;
    } else if (activity === 'idle') {
      label = 'Idle';
      statusText = null;
    }

    return {
      activity,
      label,
      statusText,
      isWorking: activity !== 'idle' && activity !== 'complete',
      isStreaming: activity === 'streaming' || activity === 'tooling',
      isCooldown,
      isWaitingForPermission: hasPermission,
      isRetry,
      isComplete,
      activeToolName,
      lifecyclePhase: streaming.phase,
    };
  }, [conversation, currentSession?.status, permissions.length, questions.length, selectedDirectory, sessionStatus, streaming.phase]);
}
