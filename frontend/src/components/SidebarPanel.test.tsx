import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SidebarPanel from './SidebarPanel';

const models = [
  { id: 'm1', name: 'Claude 3.5 Sonnet', provider: 'anthropic', authRequired: true, isDefault: true },
  { id: 'm2', name: 'GPT-4.1', provider: 'openai', authRequired: true },
];

const sessions = [
  { id: 's1', cwd: '/tmp', model: 'm1', status: 'idle', messages: [], createdAt: '2026-04-15T10:00:00.000Z', updatedAt: '2026-04-15T10:00:00.000Z' },
  { id: 's2', cwd: '/var/app', model: 'm2', status: 'done', messages: [], createdAt: '2026-04-15T10:01:00.000Z', updatedAt: '2026-04-15T10:01:00.000Z' },
];

describe('SidebarPanel', () => {
  it('renders sessions, models and actions, and filters sessions', () => {
    const onSelectSession = vi.fn();
    const onDeleteSession = vi.fn();
    const onCreateSession = vi.fn();
    const onModelChange = vi.fn();
    const onCwdCommit = vi.fn();

    function Harness() {
      const [sessionFilter, setSessionFilter] = useState('');

      return (
        <SidebarPanel
          cwd="/tmp"
          setCwd={vi.fn()}
          sessionFilter={sessionFilter}
          setSessionFilter={setSessionFilter}
          statusMessage="Connesso"
          error=""
          sessions={sessions}
          sessionId="s1"
          models={models}
          currentModelId="m1"
          onCwdCommit={onCwdCommit}
          onCreateSession={onCreateSession}
          onModelChange={onModelChange}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText('Pi Web')).toBeInTheDocument();
    expect(screen.getByLabelText('Sessione s1')).toBeInTheDocument();
    expect(screen.getByLabelText('Sessione s2')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('m1');

    fireEvent.click(screen.getByText('Nuova sessione'));
    fireEvent.click(screen.getByLabelText('Elimina sessione s1'));
    expect(onCreateSession).toHaveBeenCalled();
    expect(onDeleteSession).toHaveBeenCalledWith('s1');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm2' } });
    expect(onModelChange).toHaveBeenCalledWith('m2');

    fireEvent.click(screen.getByLabelText('Cerca sessioni'));
    fireEvent.change(screen.getByLabelText('Cerca sessioni'), { target: { value: 'var' } });
    expect(screen.queryByLabelText('Sessione s1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sessione s2')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Sessione s2'));
    expect(onSelectSession).toHaveBeenCalledWith('s2');

    expect(onCwdCommit).not.toHaveBeenCalled();
  });
});
