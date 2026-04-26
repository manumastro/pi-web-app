import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppController } from './sync/use-app-controller';
import { useAssistantStatus } from './hooks/useAssistantStatus';
import { useMobileRuntime } from './hooks/useMobileRuntime';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useUIStore } from './stores/uiStore';
import type { StreamingState } from './types';

import { MainLayout } from './components/layout/MainLayout';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ChatView } from './components/views/ChatView';
import { ChatEmptyState } from './components/chat/ChatEmptyState';
import { ConversationPanel } from './components/chat/ConversationPanel';
import { ComposerPanel } from './components/chat/ComposerPanel';
import { Toaster } from './components/ui';
import { CommandPalette } from './components/command/CommandPalette';

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

  const sidebar = useMemo(() => (
    <Sidebar
      projects={projectDirectories}
      sessions={visibleSessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={selectedSessionId}
      homeDirectory={homeDirectory}
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
      sidebarOpen={sidebarOpen}
      onNewSession={handleCreateSession}
      onToggleSidebar={toggleSidebar}
    />
  ), [currentDirectoryLabel, currentSession?.title, handleCreateSession, sidebarOpen, toggleSidebar]);

  const content = selectedSessionId ? (
    <ChatView sessionId={selectedSessionId}>
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

  const connectionBanner = !selectedSessionId && streaming === 'error'
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
