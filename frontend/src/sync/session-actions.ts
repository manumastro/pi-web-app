import type { SessionInfo } from '@/types';
import { apiRequest } from '@/api';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
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

  sessionStore.setSelectedSessionId(session.id);
  sessionStore.setSelectedDirectory(session.cwd);
  setSyncDirectory(session.cwd);
  upsertDirectorySession(session);
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
    const session = useSessionStore.getState().sessions.find((entry) => entry.id === sessionId);
    useSessionStore.getState().deleteSession(sessionId);
    if (session?.cwd) {
      clearSessionPrefetchDirectory(session.cwd);
    }
    reconcileSessionDirectories(useSessionStore.getState().sessions);
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

export async function abortCurrentOperation(sessionId: string): Promise<void> {
  try {
    await apiRequest('/api/messages/abort', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  } catch (error) {
    console.error('[session-actions] abort failed', error);
  }
}

export async function sendPrompt(input: SendPromptInput): Promise<boolean> {
  const sessionStore = useSessionStore.getState();
  const sessionId = input.sessionId || sessionStore.selectedSessionId;
  if (!sessionId) {
    return false;
  }

  const currentSession = sessionStore.sessions.find((entry) => entry.id === sessionId) ?? sessionStore.currentSession;
  const cwd = input.cwd ?? currentSession?.cwd ?? sessionStore.selectedDirectory;
  const resolvedModel = resolveModelKey(input.model || currentSession?.model, sessionId);

  if (!resolvedModel) {
    const chat = useChatStore.getState();
    chat.setError('No model selected');
    chat.setStreaming('error');
    chat.setStatusMessage('Error');
    return false;
  }

  const syncedSession = await updateSessionModel(sessionId, resolvedModel);
  if (!syncedSession) {
    const chat = useChatStore.getState();
    chat.setStreaming('error');
    chat.setStatusMessage('Error');
    chat.setError('Unable to update session model');
    return false;
  }

  const effectiveSession = syncedSession ?? currentSession;

  const chat = useChatStore.getState();
  chat.setError('');
  chat.setStreaming('streaming');
  chat.setStatusMessage('Working');
  chat.appendPrompt(input.message, resolvedModel, input.turnId);
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
        messageId: input.turnId,
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
