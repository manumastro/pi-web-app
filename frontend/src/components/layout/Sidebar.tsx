import React from 'react';
import { SidebarPanel } from '@/components/session/SidebarPanel';
import type { DirectoryInfo, SessionInfo } from '@/types';

interface SidebarProps {
  projects: DirectoryInfo[];
  sessions: SessionInfo[];
  selectedDirectory: string;
  selectedSessionId: string;
  homeDirectory: string;
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
  return (
    <SidebarPanel
      projects={projects}
      sessions={sessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={selectedSessionId}
      homeDirectory={homeDirectory}
      sidebarOpen={sidebarOpen}
      onDirectorySelect={onDirectorySelect}
      onProjectAdd={onProjectAdd}
      onProjectRemove={onProjectRemove}
      onSessionSelect={onSessionSelect}
      onSessionDelete={onSessionDelete}
      onSessionRename={onSessionRename}
      onNewSession={onNewSession}
      onToggleSidebar={onToggleSidebar}
    />
  );
}

export default Sidebar;
