import React from 'react';
import { SidebarPanel } from '@/components/session/SidebarPanel';
import type { DirectoryInfo, SessionInfo } from '@/types';

interface SidebarProps {
  directories: DirectoryInfo[];
  sessions: SessionInfo[];
  selectedDirectory: string;
  selectedSessionId: string;
  sidebarOpen?: boolean;
  onDirectorySelect: (cwd: string) => void;
  onSessionSelect: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onNewSession: () => void;
  onToggleSidebar: () => void;
}

export function Sidebar({
  directories,
  sessions,
  selectedDirectory,
  selectedSessionId,
  sidebarOpen,
  onDirectorySelect,
  onSessionSelect,
  onSessionDelete,
  onNewSession,
  onToggleSidebar,
}: SidebarProps) {
  return (
    <SidebarPanel
      directories={directories}
      sessions={sessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={selectedSessionId}
      sidebarOpen={sidebarOpen}
      onDirectorySelect={onDirectorySelect}
      onSessionSelect={onSessionSelect}
      onSessionDelete={onSessionDelete}
      onNewSession={onNewSession}
      onToggleSidebar={onToggleSidebar}
    />
  );
}

export default Sidebar;
