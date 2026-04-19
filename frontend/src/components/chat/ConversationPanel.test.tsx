import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ConversationPanel } from './ConversationPanel';
import type { ConversationItem } from '@/chatState';

const items: ConversationItem[] = [
  {
    kind: 'message',
    id: 'user-1',
    role: 'user',
    content: 'hello',
    timestamp: '2026-04-19T07:56:00.000Z',
    status: 'complete',
  },
  {
    kind: 'thinking',
    id: 'thinking-1',
    messageId: 'assistant-1',
    content: 'Reasoning chunk 1',
    done: true,
    timestamp: '2026-04-19T07:56:01.000Z',
  },
  {
    kind: 'message',
    id: 'assistant-1',
    messageId: 'assistant-1',
    role: 'assistant',
    content: 'Ciao!',
    timestamp: '2026-04-19T07:56:02.000Z',
    status: 'complete',
  },
];

describe('ConversationPanel', () => {
  it('renders thinking above the matching assistant message', () => {
    const { container, getByText } = render(<ConversationPanel items={items} />);

    expect(getByText('Reasoning chunk 1')).toBeInTheDocument();
    expect(getByText('Ciao!')).toBeInTheDocument();

    const messageNodes = [...container.querySelectorAll('.messages-panel > .message')];
    expect(messageNodes[0]).toHaveClass('message-user');
    expect(messageNodes[1]).toHaveClass('message-thinking');
    expect(messageNodes[2]).toHaveClass('message-assistant');
  });
});
