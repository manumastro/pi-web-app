import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';
import type { DirectoryInfo, ModelInfo, SessionInfo } from '@/types';

const sessions: SessionInfo[] = [
  {
    id: 's1',
    cwd: '/repo/app',
    title: 'Fix streaming',
    status: 'busy',
    messages: [],
    createdAt: '2026-04-26T10:00:00.000Z',
    updatedAt: '2026-04-26T10:10:00.000Z',
  },
  {
    id: 's2',
    cwd: '/repo/site',
    title: 'Docs polish',
    status: 'idle',
    messages: [],
    createdAt: '2026-04-26T10:00:00.000Z',
    updatedAt: '2026-04-26T10:05:00.000Z',
  },
];

const projects: DirectoryInfo[] = [
  { cwd: '/repo/app', label: 'app', sessionCount: 1, updatedAt: '2026-04-26T10:10:00.000Z' },
];

const models: ModelInfo[] = [
  { key: 'provider/model-a', id: 'model-a', label: 'Model A', available: true, active: true, provider: 'provider', reasoning: true },
];

function renderPalette(props?: Partial<React.ComponentProps<typeof CommandPalette>>) {
  return render(
    <CommandPalette
      open
      onOpenChange={vi.fn()}
      sessions={sessions}
      projects={projects}
      models={models}
      selectedSessionId="s1"
      selectedDirectory="/repo/app"
      onNewSession={vi.fn()}
      onSessionSelect={vi.fn()}
      onDirectorySelect={vi.fn()}
      onModelSelect={vi.fn()}
      {...props}
    />,
  );
}

describe('CommandPalette', () => {
  it('filters and runs session commands', async () => {
    const onSessionSelect = vi.fn();
    renderPalette({ onSessionSelect });

    const input = screen.getByLabelText('Search commands');
    fireEvent.change(input, { target: { value: 'docs' } });

    expect(screen.getByText('Docs polish')).toBeInTheDocument();
    expect(screen.queryByText('Fix streaming')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Docs polish'));
    await waitFor(() => expect(onSessionSelect).toHaveBeenCalledWith('s2'));
  });

  it('opens from the keyboard shortcut', () => {
    const onOpenChange = vi.fn();
    renderPalette({ open: false, onOpenChange });

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('runs the active command with Enter', async () => {
    const onNewSession = vi.fn();
    renderPalette({ onNewSession });

    const input = screen.getByLabelText('Search commands');
    fireEvent.change(input, { target: { value: 'new session' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onNewSession).toHaveBeenCalled());
  });
});
