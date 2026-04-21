import { useCallback, useMemo } from 'react';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { useUIStore } from '@/stores/uiStore';
import {
  abortCurrentOperation,
  createSession,
  deleteSession,
  sendPrompt,
  updateSessionModel,
  updateSessionThinkingLevel,
  updateSessionTitle,
} from './session-actions';

export interface SyncActions {
  currentSessionId: string;
  currentDirectory: string;
  activeModelKey: string;
  createSession: typeof createSession;
  deleteSession: typeof deleteSession;
  updateSessionTitle: typeof updateSessionTitle;
  updateSessionModel: typeof updateSessionModel;
  updateSessionThinkingLevel: typeof updateSessionThinkingLevel;
  abortCurrentOperation: typeof abortCurrentOperation;
  sendPrompt: typeof sendPrompt;
}

export function useSync(): SyncActions {
  const currentSessionId = useSessionUiStore((state) => state.selectedSessionId);
  const currentDirectory = useSessionUiStore((state) => state.selectedDirectory);
  const activeModelKey = useUIStore((state) => state.activeModelKey);

  const create = useCallback(createSession, []);
  const remove = useCallback(deleteSession, []);
  const rename = useCallback(updateSessionTitle, []);
  const retargetModel = useCallback(updateSessionModel, []);
  const retargetThinking = useCallback(updateSessionThinkingLevel, []);
  const abort = useCallback(abortCurrentOperation, []);
  const prompt = useCallback(sendPrompt, []);

  return useMemo(
    () => ({
      currentSessionId,
      currentDirectory,
      activeModelKey,
      createSession: create,
      deleteSession: remove,
      updateSessionTitle: rename,
      updateSessionModel: retargetModel,
      updateSessionThinkingLevel: retargetThinking,
      abortCurrentOperation: abort,
      sendPrompt: prompt,
    }),
    [activeModelKey, abort, create, currentDirectory, currentSessionId, prompt, remove, rename, retargetModel, retargetThinking],
  );
}
