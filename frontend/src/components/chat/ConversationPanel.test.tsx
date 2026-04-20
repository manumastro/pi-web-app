import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { appendPrompt, type ConversationItem } from '@/chatState';
import { ConversationPanel } from './ConversationPanel';

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
    kind: 'tool_call',
    id: 'tool-call-1',
    toolCallId: 'tool-call-1',
    messageId: 'assistant-1',
    toolName: 'bash',
    input: 'pwd',
    timestamp: '2026-04-19T07:56:01.500Z',
  },
  {
    kind: 'tool_result',
    id: 'tool-call-1-result',
    toolCallId: 'tool-call-1',
    messageId: 'assistant-1',
    result: '{"content":[{"type":"text","text":"/home/manu\n"}]}',
    success: true,
    timestamp: '2026-04-19T07:56:01.800Z',
  },
  {
    kind: 'thinking',
    id: 'thinking-1',
    messageId: 'assistant-1',
    content: '> checking cwd',
    done: true,
    timestamp: '2026-04-19T07:56:01.900Z',
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
  {
    kind: 'message',
    id: 'assistant-1-followup',
    messageId: 'assistant-1',
    role: 'assistant',
    content: 'Siamo in `/home/manu`.',
    timestamp: '2026-04-19T07:56:02.100Z',
    status: 'complete',
  },
];

describe('ConversationPanel', () => {
  it('renders a grouped turn with collapsed reasoning/tool blocks and preserves arrival order', () => {
    const { container, getByText } = render(<ConversationPanel items={items} />);

    expect(container.querySelector('.turn-item')).not.toBeNull();
    expect(container.querySelector('.turn-user-header .message-user')).not.toBeNull();
    expect(getByText('Ciao!')).toBeInTheDocument();
    expect(container.querySelector('.message-assistant-turn')).toHaveTextContent('Siamo in');
    expect(container.querySelector('.message-assistant-turn')).toHaveTextContent('/home/manu');

    const turnEntries = [...container.querySelectorAll('.message-assistant-turn .message-turn-stack > *')];
    expect(turnEntries).toHaveLength(4);
    expect(turnEntries[0]).toHaveClass('tool-block');
    expect(turnEntries[1]).toHaveClass('reasoning-timeline-block');
    expect(turnEntries[2]).toHaveTextContent('Ciao!');
    expect(turnEntries[3]).toHaveTextContent('Siamo in');
    expect(turnEntries[3]).toHaveTextContent('/home/manu');

    const toolHeader = container.querySelector('.tool-header');
    expect(toolHeader).not.toBeNull();
    expect(container.querySelector('.tool-input')).toBeNull();
    expect(container.querySelector('.tool-output')).toBeNull();

    fireEvent.click(toolHeader!);
    expect(container.querySelector('.tool-input')).toHaveTextContent('pwd');
    expect(container.querySelector('.tool-output')).toHaveTextContent('/home/manu');

    const reasoningSummary = container.querySelector('.reasoning-summary-row');
    expect(reasoningSummary).not.toBeNull();
    expect(container.querySelector('.reasoning-expanded-body')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(reasoningSummary!);
    expect(container.querySelector('.reasoning-expanded-body')).toHaveAttribute('aria-hidden', 'false');
    expect(container.querySelector('.reasoning-content-markdown')).toHaveTextContent('checking cwd');
  });

  it('does not render a literal ellipsis for empty streaming assistant content', () => {
    const streamingItems = appendPrompt([], 'hello');
    const { queryByText } = render(<ConversationPanel items={streamingItems} />);

    expect(queryByText('…')).toBeNull();
  });

  it('hides reasoning traces when disabled', () => {
    const { container, queryByText } = render(<ConversationPanel items={items} showReasoningTraces={false} />);

    expect(queryByText('checking cwd')).toBeNull();
    expect(container.querySelector('.reasoning-timeline-block')).toBeNull();
    expect(container.querySelector('.message-assistant-turn')).toHaveTextContent('Ciao!');
    expect(container.querySelector('.message-assistant-turn')).toHaveTextContent('/home/manu');
  });

  it('renders reasoning before tool output only when that is the actual arrival order', () => {
    const reorderedItems: ConversationItem[] = [
      {
        kind: 'message',
        id: 'user-2',
        role: 'user',
        content: 'in che cwd siamo?',
        timestamp: '2026-04-19T07:56:00.000Z',
        status: 'complete',
      },
      {
        kind: 'thinking',
        id: 'thinking-2',
        messageId: 'assistant-2',
        content: '> checking cwd',
        done: true,
        timestamp: '2026-04-19T07:56:01.000Z',
      },
      {
        kind: 'tool_call',
        id: 'tool-call-2',
        toolCallId: 'tool-call-2',
        messageId: 'assistant-2',
        toolName: 'bash',
        input: 'pwd',
        timestamp: '2026-04-19T07:56:01.500Z',
      },
      {
        kind: 'tool_result',
        id: 'tool-call-2-result',
        toolCallId: 'tool-call-2',
        messageId: 'assistant-2',
        result: '{"content":[{"type":"text","text":"/home/manu\n"}]}',
        success: true,
        timestamp: '2026-04-19T07:56:01.800Z',
      },
      {
        kind: 'message',
        id: 'assistant-2',
        messageId: 'assistant-2',
        role: 'assistant',
        content: 'Siamo in `/home/manu`.',
        timestamp: '2026-04-19T07:56:02.000Z',
        status: 'complete',
      },
    ];

    const { container } = render(<ConversationPanel items={reorderedItems} />);

    const turnEntries = [...container.querySelectorAll('.message-assistant-turn .message-turn-stack > *')];
    expect(turnEntries).toHaveLength(3);
    expect(turnEntries[0]).toHaveClass('reasoning-timeline-block');
    expect(turnEntries[1]).toHaveClass('tool-block');
    expect(turnEntries[2]).toHaveTextContent('Siamo in');
    expect(turnEntries[2]).toHaveTextContent('/home/manu');
  });
});
