import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SidebarPanel from './SidebarPanel';
import type { DirectoryInfo, SessionInfo } from '../types';

const sessions: SessionInfo[] = [
  {
    id: 's1',
    cwd: '/tmp',
    model: 'anthropic/claude-3-5-sonnet-20241022',
    title: 'First session',
    status: 'idle',
    messages: [],
    createdAt: '2026-04-15T10:00:00.000Z',
    updatedAt: '2026-04-15T10:00:00.000Z',
  },
  {
    id: 's2',
    cwd: '/tmp',
    model: 'openai/gpt-4o',
    title: 'Second session',
    status: 'done',
    messages: [],
    createdAt: '2026-04-15T10:05:00.000Z',
    updatedAt: '2026-04-15T10:05:00.000Z',
  },
];

const directories: DirectoryInfo[] = [
  { cwd: '/tmp', label: 'tmp', sessionCount: 2, updatedAt: '2026-04-15T10:05:00.000Z' },
];

describe('SidebarPanel', () => {
  it('renders directories and sessions', () => {
    const onDirectorySelect = vi.fn();
    const onSessionSelect = vi.fn();
    const onSessionDelete = vi.fn();
    const onNewSession = vi.fn();
    const onToggleSidebar = vi.fn();

    render(
      <SidebarPanel
        directories={directories}
        sessions={sessions}
        selectedDirectory="/tmp"
        selectedSessionId="s1"
        onDirectorySelect={onDirectorySelect}
        onSessionSelect={onSessionSelect}
        onSessionDelete={onSessionDelete}
        onNewSession={onNewSession}
        onToggleSidebar={onToggleSidebar}
      />,
    );

    // Directory
    expect(screen.getByText('tmp')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // session count

    // Session list
    expect(screen.getByText('First session')).toBeInTheDocument();
    expect(screen.getByText('Second session')).toBeInTheDocument();

    // New session button
    fireEvent.click(screen.getByRole('button', { name: 'New session' }));
    expect(onNewSession).toHaveBeenCalled();

    // Session selection
    fireEvent.click(screen.getByText('Second session'));
    expect(onSessionSelect).toHaveBeenCalledWith('s2');

    // Session delete
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete session' });
    fireEvent.click(deleteButtons[0]!);
    expect(onSessionDelete).toHaveBeenCalledWith('s1');
  });

  it('shows empty state when no sessions', () => {
    render(
      <SidebarPanel
        directories={[]}
        sessions={[]}
        selectedDirectory="/empty"
        selectedSessionId=""
        onDirectorySelect={vi.fn()}
        onSessionSelect={vi.fn()}
        onSessionDelete={vi.fn()}
        onNewSession={vi.fn()}
        onToggleSidebar={vi.fn()}
      />,
    );

    expect(screen.getByText('No sessions in this workspace yet.')).toBeInTheDocument();
  });
});
