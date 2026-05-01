import type { PromptImageAttachment, SessionInfo, ThinkingLevel } from '@/types';
import { apiRequest } from '@/api';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { useUIStore } from '@/stores/uiStore';
import { reconcileSessionDirectories, upsertDirectorySession } from './bootstrap';
import { useInputStore } from './input-store';
import { clearSessionPrefetchDirectory } from './session-prefetch-cache';
import { useSelectionStore } from './selection-store';
import { setSyncDirectory } from './sync-context';

export interface CreateSessionInput {
  cwd?: string;
  title?: string;
  model?: string;
  parentID?: string | null;
}

export interface SendPromptInput {
  sessionId?: string;
  cwd?: string;
  message: string;
  model?: string;
  turnId?: string;
  thinkingLevel?: ThinkingLevel;
  attachments?: PromptImageAttachment[];
}

function resolveModelKey(explicit?: string, sessionId?: string): string {
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }

  if (sessionId) {
    const selection = useSelectionStore.getState().getSessionModelSelection(sessionId);
    if (selection) {
      return `${selection.providerId}/${selection.modelId}`;
    }
  }

  const ui = useUIStore.getState();
  return (
    ui.activeModelKey
    || ui.models.find((entry) => entry.active && entry.available)?.key
    || ui.models.find((entry) => entry.available)?.key
    || ui.models[0]?.key
    || ''
  );
}

function syncActiveModel(modelKey: string, sessionId?: string): void {
  const ui = useUIStore.getState();
  if (!modelKey) {
    return;
  }

  if (sessionId) {
    const [providerId, ...rest] = modelKey.split('/');
    const modelId = rest.join('/');
    if (providerId && modelId) {
      useSelectionStore.getState().saveSessionModelSelection(sessionId, providerId, modelId);
    }
  }

  useUIStore.setState({
    models: ui.models.map((entry) => ({
      ...entry,
      active: entry.key === modelKey,
    })),
    activeModelKey: modelKey,
  });
}

function applySessionSnapshot(session: SessionInfo): void {
  const sessionStore = useSessionStore.getState();
  const existing = sessionStore.sessions.some((entry) => entry.id === session.id);

  if (existing) {
    sessionStore.updateSession(session.id, session);
  } else {
    sessionStore.addSession(session);
  }

  useSessionUiStore.getState().syncSessionSelection(session.cwd, session.id);
  setSyncDirectory(session.cwd);
  upsertDirectorySession(session);
}

function syncSessionUiFromStore(sessionId: string): void {
  const sessions = useSessionStore.getState().sessions;
  useSessionUiStore.setState((state) => ({
    ...state,
    visibleSessions: sessions.filter((entry) => entry.cwd === state.selectedDirectory),
    currentSession: state.selectedSessionId === sessionId
      ? sessions.find((entry) => entry.id === sessionId) ?? state.currentSession
      : state.currentSession,
  }));
}

export async function createSession(input: CreateSessionInput): Promise<SessionInfo | null> {
  try {
    const resolvedModel = resolveModelKey(input.model);
    const result = await apiRequest<{ session: SessionInfo }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        cwd: input.cwd,
        title: input.title,
        model: resolvedModel || undefined,
        parentID: input.parentID ?? undefined,
      }),
    });

    if (!result.session) {
      return null;
    }

    applySessionSnapshot(result.session);
    if (result.session.model) {
      syncActiveModel(result.session.model, result.session.id);
    } else if (resolvedModel) {
      syncActiveModel(resolvedModel, result.session.id);
    }

    reconcileSessionDirectories(useSessionStore.getState().sessions);
    return result.session;
  } catch (error) {
    console.error('[session-actions] createSession failed', error);
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    await apiRequest(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    const sessionUi = useSessionUiStore.getState();
    const sessionState = useSessionStore.getState();
    const session = sessionState.sessions.find((entry) => entry.id === sessionId);
    useSessionStore.getState().deleteSession(sessionId);
    if (session?.cwd) {
      clearSessionPrefetchDirectory(session.cwd);
    }

    const nextSessions = useSessionStore.getState().sessions;
    const nextVisibleSession = sessionUi.selectedDirectory
      ? nextSessions.find((entry) => entry.cwd === sessionUi.selectedDirectory && entry.id !== sessionId)
      : undefined;
    const selectedSessionId = sessionUi.selectedSessionId === sessionId
      ? nextVisibleSession?.id ?? ''
      : sessionUi.selectedSessionId;
    const selectedDirectory = selectedSessionId
      ? nextSessions.find((entry) => entry.id === selectedSessionId)?.cwd ?? sessionUi.selectedDirectory
      : sessionUi.selectedDirectory;
    sessionUi.syncSessionSelection(selectedDirectory, selectedSessionId);

    reconcileSessionDirectories(nextSessions);
    return true;
  } catch (error) {
    console.error('[session-actions] deleteSession failed', error);
    return false;
  }
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<SessionInfo | null> {
  try {
    const result = await apiRequest<{ session: SessionInfo }>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    });

    if (!result.session) {
      return null;
    }

    applySessionSnapshot(result.session);
    return result.session;
  } catch (error) {
    console.error('[session-actions] updateSessionTitle failed', error);
    return null;
  }
}

export async function updateSessionModel(sessionId: string, modelKey: string): Promise<SessionInfo | null> {
  try {
    const result = await apiRequest<{ session: SessionInfo }>('/api/models/session/model', {
      method: 'PUT',
      body: JSON.stringify({ sessionId, modelId: modelKey }),
    });

    if (!result.session) {
      return null;
    }

    applySessionSnapshot(result.session);
    syncActiveModel(modelKey, result.session.id);
    return result.session;
  } catch (error) {
    console.error('[session-actions] updateSessionModel failed', error);
    return null;
  }
}

export async function updateSessionThinkingLevel(sessionId: string, thinkingLevel: ThinkingLevel): Promise<SessionInfo | null> {
  try {
    const result = await apiRequest<{ session: SessionInfo }>('/api/models/session/thinking', {
      method: 'PUT',
      body: JSON.stringify({ sessionId, thinkingLevel }),
    });

    if (!result.session) {
      return null;
    }

    applySessionSnapshot(result.session);
    return result.session;
  } catch (error) {
    console.error('[session-actions] updateSessionThinkingLevel failed', error);
    return null;
  }
}

export async function answerQuestion(sessionId: string, questionId: string, answer: string): Promise<boolean> {
  try {
    await apiRequest('/api/messages/question/answer', {
      method: 'POST',
      body: JSON.stringify({ sessionId, questionId, answer }),
    });
    return true;
  } catch (error) {
    console.error('[session-actions] answer question failed', error);
    return false;
  }
}

export async function abortCurrentOperation(sessionId: string): Promise<void> {
  // Optimistically clear the active turn state on the frontend immediately.
  useChatStore.getState().setStreaming('idle');
  useChatStore.getState().setStatusMessage('Stopping');
  try {
    await Promise.race([
      apiRequest('/api/messages/abort', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Abort request timed out')), 10_000),
      ),
    ]);
  } catch (error) {
    console.error('[session-actions] abort failed', error);
    useChatStore.getState().setStatusMessage('Stop failed');
  }
}

function generateTurnId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function sendPrompt(input: SendPromptInput): Promise<boolean> {
  const sessionUiStore = useSessionUiStore.getState();
  const sessionId = input.sessionId || sessionUiStore.selectedSessionId;
  if (!sessionId) {
    return false;
  }

  const currentSession = sessionUiStore.currentSession ?? useSessionStore.getState().sessions.find((entry) => entry.id === sessionId);
  const cwd = input.cwd ?? currentSession?.cwd ?? sessionUiStore.selectedDirectory;
  const resolvedModel = resolveModelKey(input.model || currentSession?.model, sessionId);
  const resolvedThinkingLevel = input.thinkingLevel ?? currentSession?.thinkingLevel;

  if (!resolvedModel) {
    const chat = useChatStore.getState();
    chat.setError('No model selected');
    chat.setStreaming('error');
    chat.setStatusMessage('Error');
    return false;
  }

  syncActiveModel(resolvedModel, sessionId);
  const effectiveSession = currentSession;

  const turnId = input.turnId && input.turnId.trim().length > 0 ? input.turnId : generateTurnId();
  const attachments = input.attachments ?? [];

  const chat = useChatStore.getState();
  const optimisticPromptText = input.message.trim().length > 0
    ? input.message
    : `[Attached ${attachments.length} image${attachments.length === 1 ? '' : 's'}]`;

  chat.setError('');
  chat.setStreaming('streaming');
  chat.setStatusMessage('Working');
  chat.appendPrompt(optimisticPromptText, resolvedModel, turnId);
  chat.requestScrollToBottom();

  const optimisticUpdatedAt = new Date().toISOString();
  useSessionStore.getState().updateSession(sessionId, {
    status: 'busy',
    updatedAt: optimisticUpdatedAt,
    ...(effectiveSession?.cwd ? { cwd: effectiveSession.cwd } : {}),
    model: resolvedModel,
  });
  syncSessionUiFromStore(sessionId);

  useUIStore.getState().setPrompt('');
  useInputStore.getState().setPendingInputText(null);

  try {
    await apiRequest('/api/messages/prompt', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        cwd,
        message: input.message,
        model: resolvedModel,
        messageId: turnId,
        thinkingLevel: resolvedThinkingLevel,
        attachments,
      }),
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    chat.setStreaming('error');
    chat.setStatusMessage('Error');
    chat.setError(message);
    if (effectiveSession) {
      applySessionSnapshot(effectiveSession);
    }
    return false;
  }
}
