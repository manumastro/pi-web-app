import React from 'react';
import { SidebarPanel } from '@/components/session/SidebarPanel';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { DirectoryInfo, SessionInfo } from '@/types';

interface SidebarProps {
  projects: DirectoryInfo[];
  sessions: SessionInfo[];
  selectedDirectory: string;
  selectedSessionId: string;
  homeDirectory: string;
  relayStatusMessage?: string;
  relayConnected?: boolean;
  sidebarOpen?: boolean;
  onDirectorySelect: (cwd: string) => void;
  onProjectAdd: (path: string) => boolean;
  onProjectRemove: (cwd: string) => void;
  onSessionSelect: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onSessionRename: (id: string, title: string) => void;
  onNewSession: () => void;
  onToggleSidebar: () => void;
}

export function Sidebar({
  projects,
  sessions,
  selectedDirectory,
  selectedSessionId,
  homeDirectory,
  relayStatusMessage,
  relayConnected,
  sidebarOpen,
  onDirectorySelect,
  onProjectAdd,
  onProjectRemove,
  onSessionSelect,
  onSessionDelete,
  onSessionRename,
  onNewSession,
  onToggleSidebar,
}: SidebarProps) {
  const isCompactLayout = useMediaQuery('(max-width: 1024px)');

  return (
    <SidebarPanel
      projects={projects}
      sessions={sessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={selectedSessionId}
      homeDirectory={homeDirectory}
      relayStatusMessage={relayStatusMessage}
      relayConnected={relayConnected}
      sidebarOpen={sidebarOpen}
      onDirectorySelect={onDirectorySelect}
      onProjectAdd={onProjectAdd}
      onProjectRemove={onProjectRemove}
      onSessionSelect={onSessionSelect}
      onSessionDelete={onSessionDelete}
      onSessionRename={onSessionRename}
      onNewSession={onNewSession}
      onToggleSidebar={onToggleSidebar}
      mobileVariant={isCompactLayout}
    />
  );
}

export default Sidebar;
