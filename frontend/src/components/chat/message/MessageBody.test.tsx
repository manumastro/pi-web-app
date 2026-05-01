import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { MessageBody } from './MessageBody';

beforeEach(() => {
  useSessionUiStore.setState({
    selectedDirectory: '/home/manu',
    selectedSessionId: 'session-1',
    currentSession: undefined,
    visibleSessions: [],
  });
});

describe('MessageBody attachments', () => {
  it('renders user image attachments inline', () => {
    render(
      <MessageBody
        item={{
          kind: 'message',
          id: 'msg-1',
          role: 'user',
          content: 'guarda questa immagine',
          timestamp: '2026-05-01T10:00:00.000Z',
          status: 'complete',
          messageId: 'turn-1',
          attachments: [
            {
              uploadId: 'upload-1',
              fileName: 'diagram.png',
              mimeType: 'image/png',
              size: 1234,
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('link', { name: /diagram\.png/i })).toHaveAttribute('href', expect.stringContaining('/api/uploads/session-1/upload-1'));
    expect(screen.getByRole('img', { name: 'diagram.png' })).toHaveAttribute('src', '/api/uploads/session-1/upload-1');
    expect(screen.getByText('guarda questa immagine')).toBeInTheDocument();
  });
});
