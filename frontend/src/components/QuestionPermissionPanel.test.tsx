import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import QuestionPermissionPanel from './QuestionPermissionPanel';

describe('QuestionPermissionPanel', () => {
  it('renders questions and permissions and wires actions', () => {
    const onAnswerQuestion = vi.fn();
    const onApprovePermission = vi.fn();
    const onDenyPermission = vi.fn();

    render(
      <QuestionPermissionPanel
        items={[
          {
            kind: 'question',
            id: 'q1',
            questionId: 'q1',
            question: 'Do you want to continue?',
            options: ['yes', 'no'],
            timestamp: '2026-04-15T10:00:00.000Z',
          },
          {
            kind: 'permission',
            id: 'p1',
            permissionId: 'p1',
            action: 'write',
            resource: '/tmp/file',
            timestamp: '2026-04-15T10:00:01.000Z',
          },
        ]}
        onAnswerQuestion={onAnswerQuestion}
        onApprovePermission={onApprovePermission}
        onDenyPermission={onDenyPermission}
      />,
    );

    expect(screen.getByText('Domande')).toBeInTheDocument();
    expect(screen.getByText('Permessi')).toBeInTheDocument();
    expect(screen.getByText('Do you want to continue?')).toBeInTheDocument();
    expect(screen.getByText('write')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'yes' }));
    expect(onAnswerQuestion).toHaveBeenCalledWith(expect.objectContaining({ questionId: 'q1' }), 'yes');

    fireEvent.change(screen.getByLabelText('Risposta a q1'), { target: { value: 'custom answer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia' }));
    expect(onAnswerQuestion).toHaveBeenCalledWith(expect.objectContaining({ questionId: 'q1' }), 'custom answer');

    fireEvent.click(screen.getByRole('button', { name: 'Approva' }));
    expect(onApprovePermission).toHaveBeenCalledWith(expect.objectContaining({ permissionId: 'p1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Nega' }));
    expect(onDenyPermission).toHaveBeenCalledWith(expect.objectContaining({ permissionId: 'p1' }));
  });
});
