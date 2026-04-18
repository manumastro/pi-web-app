import React from 'react';
import { SidebarPanel } from '@/components/session/SidebarPanel';
import type { DirectoryInfo, SessionInfo } from '@/types';

interface SidebarProps {
  directories: DirectoryInfo[];
  sessions: SessionInfo[];
  selectedDirectory: string;
  selectedSessionId: string;
  onDirectorySelect: (cwd: string) => void;
  onSessionSelect: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onNewSession: () => void;
}

export function Sidebar({
  directories,
  sessions,
  selectedDirectory,
  selectedSessionId,
  onDirectorySelect,
  onSessionSelect,
  onSessionDelete,
  onNewSession,
}: SidebarProps) {
  return (
    <SidebarPanel
      directories={directories}
      sessions={sessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={selectedSessionId}
      onDirectorySelect={onDirectorySelect}
      onSessionSelect={onSessionSelect}
      onSessionDelete={onSessionDelete}
      onNewSession={onNewSession}
    />
  );
}

export default Sidebar;
