import { useMemo } from 'react';
import { useAppController } from './sync/use-app-controller';
import type { StreamingState } from './types';

import { MainLayout } from './components/layout/MainLayout';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ChatView } from './components/views/ChatView';
import { ChatEmptyState } from './components/chat/ChatEmptyState';
import { ConversationPanel } from './components/chat/ConversationPanel';
import { ComposerPanel } from './components/chat/ComposerPanel';
import { StatusRow } from './components/chat/StatusRow';
import { Toaster } from './components/ui';

function ConnectionBanner({ state, message, error }: { state: StreamingState; message: string; error?: string }) {
  if (state !== 'error') return null;
  return <div className="connection-banner error">✗ {error ?? message}</div>;
}

export default function App() {
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
        workingLabel={interactionStreaming === 'connecting' ? 'Connecting...' : 'Working...'}
      />
      <StatusRow state={interactionStreaming} statusMessage={statusMessage} onAbort={handleAbort} />
      <ComposerPanel
        prompt={prompt}
        streaming={interactionStreaming}
        models={models}
        activeModelKey={activeModelKey}
        onPromptChange={setPrompt}
        onSend={handleSend}
        onAbort={handleAbort}
        onModelSelect={handleModelSelect}
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
      />
      <Toaster />
    </>
  );
}
