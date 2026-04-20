import { beforeEach, describe, expect, it } from 'vitest';
import { useInputStore } from './input-store';
import { appendNotification, useNotificationStore } from './notification-store';
import { useSelectionStore } from './selection-store';
import { useViewportStore } from './viewport-store';
import { useVoiceStore } from './voice-store';

describe('sync auxiliary stores', () => {
  beforeEach(() => {
    useInputStore.setState({
      pendingInputText: null,
      pendingInputMode: 'replace',
      pendingSyntheticParts: null,
      attachedFiles: [],
    });
    useNotificationStore.setState({
      list: [],
      index: {
        session: { unseenCount: {}, unseenHasError: {} },
        project: { unseenCount: {}, unseenHasError: {} },
      },
    });
    useSelectionStore.setState({
      sessionModelSelections: new Map(),
      sessionAgentSelections: new Map(),
      sessionAgentModelSelections: new Map(),
      lastUsedProvider: null,
    });
    useViewportStore.setState({ sessionMemoryState: new Map(), isSyncing: false });
    useVoiceStore.setState({ voiceStatus: 'disconnected', voiceMode: 'idle' });
  });

  it('stores and consumes pending input text', () => {
    useInputStore.getState().setPendingInputText('hello', 'append');
    expect(useInputStore.getState().consumePendingInputText()).toEqual({ text: 'hello', mode: 'append' });
    expect(useInputStore.getState().consumePendingInputText()).toBeNull();
  });

  it('tracks model selections per session', () => {
    useSelectionStore.getState().saveSessionModelSelection('session-1', 'provider', 'model');
    expect(useSelectionStore.getState().getSessionModelSelection('session-1')).toEqual({ providerId: 'provider', modelId: 'model' });
  });

  it('builds unread notification counts', () => {
    appendNotification({ type: 'turn-complete', session: 'session-1', directory: '/demo', time: Date.now(), viewed: false });
    appendNotification({ type: 'error', session: 'session-1', directory: '/demo', time: Date.now(), viewed: false, error: { message: 'boom' } });
    expect(useNotificationStore.getState().sessionUnseenCount('session-1')).toBe(2);
    expect(useNotificationStore.getState().sessionHasError('session-1')).toBe(true);
  });

  it('updates viewport anchors and voice state', () => {
    useViewportStore.getState().updateViewportAnchor('session-1', 42);
    useVoiceStore.getState().setVoiceStatus('connected');
    useVoiceStore.getState().setVoiceMode('speaking');
    expect(useViewportStore.getState().sessionMemoryState.get('session-1')?.viewportAnchor).toBe(42);
    expect(useVoiceStore.getState().voiceStatus).toBe('connected');
    expect(useVoiceStore.getState().voiceMode).toBe('speaking');
  });
});
