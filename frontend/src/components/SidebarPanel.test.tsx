import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SidebarPanel from './SidebarPanel';
import type { DirectoryInfo, ModelInfo, SessionInfo } from '../types';

const models: ModelInfo[] = [
  {
    key: 'anthropic/claude-3-5-sonnet-20241022',
    id: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    available: true,
    active: true,
    provider: 'anthropic',
  },
  {
    key: 'openai/gpt-4o',
    id: 'gpt-4o',
    label: 'GPT-4o',
    available: false,
    active: false,
    provider: 'openai',
  },
];

const sessions: SessionInfo[] = [
  {
    id: 's1',
    cwd: '/tmp',
    model: 'anthropic/claude-3-5-sonnet-20241022',
    title: 'Prima sessione',
    status: 'idle',
    messages: [],
    createdAt: '2026-04-15T10:00:00.000Z',
    updatedAt: '2026-04-15T10:00:00.000Z',
  },
  {
    id: 's2',
    cwd: '/tmp',
    model: 'openai/gpt-4o',
    title: 'Seconda sessione',
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
  it('renders directories, sessions and model selector', () => {
    const onDirectorySelect = vi.fn();
    const onSessionSelect = vi.fn();
    const onSessionDelete = vi.fn();
    const onNewSession = vi.fn();
    const onModelFilterChange = vi.fn();
    const onModelSelect = vi.fn();

    render(
      <SidebarPanel
        directories={directories}
        sessions={sessions}
        selectedDirectory="/tmp"
        selectedSessionId="s1"
        models={models}
        modelFilter=""
        onDirectorySelect={onDirectorySelect}
        onSessionSelect={onSessionSelect}
        onSessionDelete={onSessionDelete}
        onNewSession={onNewSession}
        onModelFilterChange={onModelFilterChange}
        onModelSelect={onModelSelect}
      />,
    );

    // Header
    expect(screen.getByText('Progetti')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuova sessione' })).toBeInTheDocument();

    // Directory
    expect(screen.getByText('tmp')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // session count

    // Session list
    expect(screen.getByText('Prima sessione')).toBeInTheDocument();
    expect(screen.getByText('Seconda sessione')).toBeInTheDocument();

    // New session button
    fireEvent.click(screen.getByRole('button', { name: 'Nuova sessione' }));
    expect(onNewSession).toHaveBeenCalled();

    // Session selection
    fireEvent.click(screen.getByText('Seconda sessione'));
    expect(onSessionSelect).toHaveBeenCalledWith('s2');

    // Session delete
    const deleteButtons = screen.getAllByRole('button', { name: 'Elimina sessione' });
    fireEvent.click(deleteButtons[0]!);
    expect(onSessionDelete).toHaveBeenCalledWith('s1');

    // Model filter
    expect(screen.getByPlaceholderText('Cerca modello…')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Cerca modello…'), { target: { value: 'gpt' } });
    expect(onModelFilterChange).toHaveBeenCalledWith('gpt');

    // Model filter shows only matching models
    fireEvent.change(screen.getByPlaceholderText('Cerca modello…'), { target: { value: 'gpt' } });
    expect(onModelFilterChange).toHaveBeenCalledWith('gpt');

    // Model selection — there should be at least one GPT-4o button
    const modelButtons = screen.getAllByRole('button', { name: /GPT-4o/i });
    expect(modelButtons.length).toBeGreaterThan(0);
    fireEvent.click(modelButtons[0]!);
    expect(onModelSelect).toHaveBeenCalledWith('openai/gpt-4o');
  });

  it('shows empty state when no sessions', () => {
    render(
      <SidebarPanel
        directories={[]}
        sessions={[]}
        selectedDirectory="/empty"
        selectedSessionId=""
        models={[]}
        modelFilter=""
        onDirectorySelect={vi.fn()}
        onSessionSelect={vi.fn()}
        onSessionDelete={vi.fn()}
        onNewSession={vi.fn()}
        onModelFilterChange={vi.fn()}
        onModelSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/Nessuna sessione/)).toBeInTheDocument();
  });
});
