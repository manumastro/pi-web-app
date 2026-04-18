import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuestionPermissionPanel from './QuestionPermissionPanel';

describe('QuestionPermissionPanel', () => {
  it('renders questions and permissions when present', () => {
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
      />,
    );

    expect(screen.getByText('Domande')).toBeInTheDocument();
    expect(screen.getByText('Permessi')).toBeInTheDocument();
    expect(screen.getByText('Do you want to continue?')).toBeInTheDocument();
    expect(screen.getByText('write')).toBeInTheDocument();
  });
});
