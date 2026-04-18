import React from 'react';
import { SidebarPanel } from '@/components/session/SidebarPanel';
import type { DirectoryInfo, ModelInfo, SessionInfo } from '@/types';

interface SidebarProps {
  directories: DirectoryInfo[];
  sessions: SessionInfo[];
  selectedDirectory: string;
  selectedSessionId: string;
  models: ModelInfo[];
  modelFilter: string;
  onDirectorySelect: (cwd: string) => void;
  onSessionSelect: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onNewSession: () => void;
  onModelFilterChange: (filter: string) => void;
  onModelSelect: (modelKey: string) => void;
}

export function Sidebar({
  directories,
  sessions,
  selectedDirectory,
  selectedSessionId,
  models,
  modelFilter,
  onDirectorySelect,
  onSessionSelect,
  onSessionDelete,
  onNewSession,
  onModelFilterChange,
  onModelSelect,
}: SidebarProps) {
  return (
    <SidebarPanel
      directories={directories}
      sessions={sessions}
      selectedDirectory={selectedDirectory}
      selectedSessionId={selectedSessionId}
      models={models}
      modelFilter={modelFilter}
      onDirectorySelect={onDirectorySelect}
      onSessionSelect={onSessionSelect}
      onSessionDelete={onSessionDelete}
      onNewSession={onNewSession}
      onModelFilterChange={onModelFilterChange}
      onModelSelect={onModelSelect}
    />
  );
}

export default Sidebar;
