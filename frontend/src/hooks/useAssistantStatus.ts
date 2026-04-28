import { useMemo } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { useUIStore } from '@/stores/uiStore';
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

function formatUsageMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const numberValue = (key: string) => (typeof metadata[key] === 'number' ? metadata[key] as number : undefined);
  const totalTokens = numberValue('totalTokens');
  const inputTokens = numberValue('inputTokens');
  const outputTokens = numberValue('outputTokens');
  const contextUsed = numberValue('contextUsed');
  const contextWindow = numberValue('contextWindow');
  const contextPercent = numberValue('contextPercent');
  const parts: string[] = [];
  if (totalTokens !== undefined) parts.push(`${totalTokens.toLocaleString()} tok`);
  else if (inputTokens !== undefined || outputTokens !== undefined) parts.push(`${inputTokens ?? 0}/${outputTokens ?? 0} tok`);
  if (contextPercent !== undefined) parts.push(`${Math.round(contextPercent)}% ctx`);
  else if (contextUsed !== undefined && contextWindow) parts.push(`${Math.round((contextUsed / contextWindow) * 100)}% ctx`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function getLastAssistantRelatedItems(items: ConversationItem[]) {
  let activeToolName: string | undefined;
  let hasPendingTool = false;
  let hasAssistantText = false;
  const resolvedToolCallIds = new Set<string>();

  // Evaluate only the latest user→assistant turn (scan backwards until the last user message).
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item.kind === 'message' && item.role === 'user') {
      break;
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
      }
      continue;
    }

    if (item.kind === 'message' && item.role === 'assistant' && item.content.trim().length > 0) {
      hasAssistantText = true;
    }
  }

  return { activeToolName, hasPendingTool, hasAssistantText };
}

export function useAssistantStatus(): AssistantStatusSnapshot {
  const conversation = useChatStore((state) => state.conversation);
  const selectedSessionId = useSessionUiStore((state) => state.selectedSessionId);
  const selectedDirectory = useSessionUiStore((state) => state.selectedDirectory);
  const currentSession = useSessionUiStore((state) => state.currentSession);
  const activeModel = useUIStore((state) => state.models.find((model) => model.key === state.activeModelKey));
  const sessionStatus = useSessionStatus(selectedSessionId, selectedDirectory);
  const permissions = useSessionPermissions(selectedSessionId, selectedDirectory);
  const questions = useSessionQuestions(selectedSessionId, selectedDirectory);
  const streaming = useStreamingSession(selectedSessionId || undefined);

  return useMemo(() => {
    const statusType = getSessionStatusType(sessionStatus) ?? getSessionStatusType(currentSession?.status);
    const { activeToolName, hasPendingTool, hasAssistantText } = getLastAssistantRelatedItems(conversation);
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

    let activity: AssistantActivity = 'idle';
    if (hasPermission) {
      activity = 'permission';
    } else if (isRetry) {
      activity = 'retry';
    } else if (isCooldown) {
      activity = 'cooldown';
    } else if (isStreaming && hasAssistantText) {
      activity = 'streaming';
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

    const modelContextText = activeModel?.contextWindow ? `${Math.round(activeModel.contextWindow / 1000)}k ctx window` : null;
    const usageText = formatUsageMetadata(sessionStatus?.metadata) ?? modelContextText;

    return {
      activity,
      label,
      statusText: [sessionStatus?.message, usageText].filter(Boolean).join(' · ') || null,
      isWorking: activity !== 'idle' && activity !== 'complete',
      isStreaming: activity === 'streaming' || activity === 'tooling',
      isCooldown,
      isWaitingForPermission: hasPermission,
      isRetry,
      isComplete,
      activeToolName,
      lifecyclePhase: streaming.phase,
    };
  }, [activeModel?.contextWindow, conversation, currentSession?.status, permissions.length, questions.length, selectedDirectory, sessionStatus, streaming.phase]);
}
