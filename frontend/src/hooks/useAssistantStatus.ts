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

function getLastAssistantRelatedItems(items: ConversationItem[]) {
  let activeToolName: string | undefined;
  let hasPendingTool = false;
  let hasAssistantText = false;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === 'tool_result') {
      if (hasPendingTool) {
        hasPendingTool = false;
      }
      continue;
    }

    if (item.kind === 'tool_call') {
      hasPendingTool = true;
      activeToolName = item.toolName;
      continue;
    }

    if (item.kind === 'message' && item.role === 'assistant') {
      hasAssistantText = item.content.trim().length > 0;
      break;
    }

    if (item.kind === 'message' && item.role === 'user') {
      break;
    }
  }

  return { activeToolName, hasPendingTool, hasAssistantText };
}

export function useAssistantStatus(): AssistantStatusSnapshot {
  const conversation = useChatStore((state) => state.conversation);
  const selectedSessionId = useSessionUiStore((state) => state.selectedSessionId);
  const selectedDirectory = useSessionUiStore((state) => state.selectedDirectory);
  const sessionStatus = useSessionStatus(selectedSessionId, selectedDirectory);
  const permissions = useSessionPermissions(selectedSessionId, selectedDirectory);
  const questions = useSessionQuestions(selectedSessionId, selectedDirectory);
  const streaming = useStreamingSession(selectedSessionId || undefined);

  return useMemo(() => {
    const statusType = getSessionStatusType(sessionStatus);
    const { activeToolName, hasPendingTool, hasAssistantText } = getLastAssistantRelatedItems(conversation);
    const hasPermission = permissions.length > 0 || questions.length > 0 || statusType === 'waiting_permission' || statusType === 'waiting_question';
    const isRetry = statusType === 'retry';
    const isCooldown = streaming.phase === 'cooldown';
    const isStreaming = streaming.phase === 'streaming' || statusType === 'busy' || statusType === 'answering' || statusType === 'prompting';
    const isTooling = !hasPermission && !isRetry && !isCooldown && (hasPendingTool || statusType === 'tooling' || statusType === 'editing');
    const isComplete = !hasPermission && !isRetry && !isCooldown && !isStreaming && !isTooling && hasAssistantText;

    let activity: AssistantActivity = 'idle';
    if (hasPermission) {
      activity = 'permission';
    } else if (isRetry) {
      activity = 'retry';
    } else if (isCooldown) {
      activity = 'cooldown';
    } else if (isTooling) {
      activity = 'tooling';
    } else if (isStreaming) {
      activity = 'streaming';
    } else if (isComplete) {
      activity = 'complete';
    }

    let label = 'Working...';
    if (activity === 'permission') {
      label = statusType === 'waiting_question' ? 'Question pending...' : 'Permission needed...';
    } else if (activity === 'retry') {
      label = 'Retrying...';
    } else if (activity === 'cooldown') {
      label = 'Finalizing...';
    } else if (activity === 'tooling') {
      label = activeToolName ? `Running ${activeToolName}...` : 'Running tools...';
    } else if (activity === 'streaming') {
      label = 'Writing...';
    } else if (activity === 'complete') {
      label = 'Complete';
    } else if (activity === 'idle') {
      label = 'Idle';
    }

    return {
      activity,
      label,
      statusText: sessionStatus?.message ?? null,
      isWorking: activity !== 'idle' && activity !== 'complete',
      isStreaming: activity === 'streaming' || activity === 'tooling',
      isCooldown,
      isWaitingForPermission: hasPermission,
      isRetry,
      isComplete,
      activeToolName,
      lifecyclePhase: streaming.phase,
    };
  }, [conversation, permissions.length, questions.length, selectedDirectory, sessionStatus, streaming.phase]);
}
