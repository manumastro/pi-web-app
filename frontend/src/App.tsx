import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppController } from './sync/use-app-controller';
import { useAssistantStatus } from './hooks/useAssistantStatus';
import { useMobileRuntime } from './hooks/useMobileRuntime';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useUIStore } from './stores/uiStore';
import { useSessionPermissions, useSessionQuestions } from './sync/sync-context';
import type { StreamingState } from './types';

import { MainLayout } from './components/layout/MainLayout';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ChatView } from './components/views/ChatView';
import { ChatEmptyState } from './components/chat/ChatEmptyState';
import { ConversationPanel } from './components/chat/ConversationPanel';
import { ComposerPanel } from './components/chat/ComposerPanel';
import { AttentionPanel } from './components/chat/AttentionPanel';
import { Toaster } from './components/ui';
import { CommandPalette } from './components/command/CommandPalette';
import { PiWorkspace, type WorkspacePanel } from './components/workspace/PiWorkspace';
import { answerQuestion } from './sync/session-actions';

const WORKSPACE_PANEL_STORAGE_KEY = 'pi-web-app:workspace-panel';

function readStoredWorkspacePanel(): WorkspacePanel {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(WORKSPACE_PANEL_STORAGE_KEY);
    return stored === 'terminal' || stored === 'files' || stored === 'git' ? stored : null;
  } catch {
    return null;
  }
}

function persistWorkspacePanel(panel: WorkspacePanel): void {
  if (typeof window === 'undefined') return;
  try {
    if (panel) window.localStorage.setItem(WORKSPACE_PANEL_STORAGE_KEY, panel);
    else window.localStorage.removeItem(WORKSPACE_PANEL_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function ConnectionBanner({ state, message, error }: { state: StreamingState; message: string; error?: string }) {
  if (state !== 'error') return null;
  return <div className="connection-banner error">✗ {error ?? message}</div>;
}

export default function App() {
  useMobileRuntime();
  const assistantStatus = useAssistantStatus();
  const isCompactLayout = useMediaQuery('(max-width: 1024px)');
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const previousCompactLayoutRef = useRef<boolean | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [workspacePanel, setWorkspacePanelState] = useState<WorkspacePanel>(() => readStoredWorkspacePanel());
  const setWorkspacePanel = (panelOrUpdater: WorkspacePanel | ((panel: WorkspacePanel) => WorkspacePanel)) => {
    setWorkspacePanelState((currentPanel) => {
      const nextPanel = typeof panelOrUpdater === 'function' ? panelOrUpdater(currentPanel) : panelOrUpdater;
      persistWorkspacePanel(nextPanel);
      return nextPanel;
    });
  };

  useEffect(() => {
    if (previousCompactLayoutRef.current === null) {
      previousCompactLayoutRef.current = isCompactLayout;
      if (isCompactLayout) {
        setSidebarOpen(false);
      }
      return;
    }

    if (previousCompactLayoutRef.current !== isCompactLayout) {
      previousCompactLayoutRef.current = isCompactLayout;
      setSidebarOpen(!isCompactLayout);
    }
  }, [isCompactLayout, setSidebarOpen]);

  const {
    conversation,
    streaming,
    statusMessage,
    error,
    sidebarOpen,
    toggleSidebar,
    models,
    activeModelKey,
    showReasoningTraces,
    relayStatusMessage,
    relayConnected,
    availableThinkingLevels,
    activeThinkingLevel,
    thinkingLevelError,
    prompt,
    setPrompt,
    projectDirectories,
    selectedDirectory,
    selectedSessionId,
    currentSession,
    currentDirectoryLabel,
    visibleSessions,
    homeDirectory,
    interactionStreaming,
    activeStreamingMessageId,
    activeStreamingPhase,
    handleSend,
    handleAbort,
    handleCreateSession,
    handleDeleteSession,
    handleDirectorySelect,
    handleProjectAdd,
    handleProjectRemove,
    handleSessionRename,
    handleSessionSelect,
    handleModelSelect,
    handleThinkingLevelSelect,
  } = useAppController();

  const pendingQuestions = useSessionQuestions(selectedSessionId, selectedDirectory);
  const pendingPermissions = useSessionPermissions(selectedSessionId, selectedDirectory);

  const sidebar = useMemo(() => (
    <Sidebar
      projects={projectDirectories}
      sessions={visibleSessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={selectedSessionId}
      homeDirectory={homeDirectory}
      relayStatusMessage={relayStatusMessage}
      relayConnected={relayConnected}
      sidebarOpen={sidebarOpen}
      onDirectorySelect={handleDirectorySelect}
      onProjectAdd={handleProjectAdd}
      onProjectRemove={handleProjectRemove}
      onSessionSelect={handleSessionSelect}
      onSessionDelete={handleDeleteSession}
      onSessionRename={handleSessionRename}
      onNewSession={handleCreateSession}
      onToggleSidebar={toggleSidebar}
    />
  ), [
    handleCreateSession,
    handleDeleteSession,
    handleDirectorySelect,
    handleProjectAdd,
    handleProjectRemove,
    handleSessionRename,
    handleSessionSelect,
    homeDirectory,
    projectDirectories,
    relayConnected,
    relayStatusMessage,
    selectedDirectory,
    selectedSessionId,
    sidebarOpen,
    toggleSidebar,
    visibleSessions,
  ]);

  const header = useMemo(() => (
    <Header
      sessionName={currentSession?.title ?? 'Untitled Session'}
      projectLabel={currentDirectoryLabel}
      relayStatusMessage={relayStatusMessage}
      relayConnected={relayConnected}
      sidebarOpen={sidebarOpen}
      onNewSession={handleCreateSession}
      onToggleSidebar={toggleSidebar}
      onToggleTerminal={() => setWorkspacePanel((panel) => (panel === 'terminal' ? null : 'terminal'))}
      onToggleFiles={() => setWorkspacePanel((panel) => (panel === 'files' ? null : 'files'))}
      onToggleGit={() => setWorkspacePanel((panel) => (panel === 'git' ? null : 'git'))}
      onOpenCommandPalette={() => setCommandPaletteOpen(true)}
    />
  ), [currentDirectoryLabel, currentSession?.title, handleCreateSession, relayConnected, relayStatusMessage, sidebarOpen, toggleSidebar]);

  const sessionErrorBanner = error ? (
    <div className="piweb-session-error-banner connection-banner error" role="alert">
      ✗ {error}
    </div>
  ) : null;

  const chatContent = selectedSessionId ? (
    <ChatView sessionId={selectedSessionId}>
      {sessionErrorBanner}
      <ConversationPanel
        items={conversation}
        error={error}
        showReasoningTraces={showReasoningTraces}
        isWorking={interactionStreaming === 'streaming' || interactionStreaming === 'connecting'}
        workingLabel={interactionStreaming === 'connecting' ? 'Connecting...' : assistantStatus.label}
        workingStatusText={interactionStreaming === 'connecting' ? 'Connecting...' : assistantStatus.statusText}
        workingActivity={assistantStatus.activity}
        activeStreamingMessageId={activeStreamingMessageId}
        activeStreamingPhase={activeStreamingPhase}
      />
      <AttentionPanel
        sessionId={selectedSessionId}
        questions={pendingQuestions}
        permissions={pendingPermissions}
        onAnswerQuestion={answerQuestion}
      />
      <ComposerPanel
        prompt={prompt}
        streaming={interactionStreaming}
        models={models}
        activeModelKey={activeModelKey}
        availableThinkingLevels={availableThinkingLevels}
        activeThinkingLevel={activeThinkingLevel}
        thinkingLevelError={thinkingLevelError}
        onPromptChange={setPrompt}
        onSend={handleSend}
        onAbort={handleAbort}
        onModelSelect={handleModelSelect}
        onThinkingLevelSelect={handleThinkingLevelSelect}
      />
    </ChatView>
  ) : (
    <ChatEmptyState onNewSession={handleCreateSession} />
  );

  const content = (
    <PiWorkspace activePanel={workspacePanel} onPanelChange={setWorkspacePanel} cwd={selectedDirectory}>
      {chatContent}
    </PiWorkspace>
  );

  const connectionBanner = streaming === 'error'
    ? <ConnectionBanner state={streaming} message={statusMessage} error={error} />
    : null;

  return (
    <>
      <MainLayout
        sidebar={sidebar}
        header={header}
        content={content}
        connectionBanner={connectionBanner}
        sidebarOpen={sidebarOpen}
        onSidebarClose={toggleSidebar}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        sessions={visibleSessions}
        projects={projectDirectories}
        models={models}
        selectedSessionId={selectedSessionId}
        selectedDirectory={selectedDirectory}
        onNewSession={handleCreateSession}
        onSessionSelect={handleSessionSelect}
        onDirectorySelect={handleDirectorySelect}
        onModelSelect={handleModelSelect}
      />
      <Toaster />
    </>
  );
}
