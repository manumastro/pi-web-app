import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { ConversationItem } from '@/sync/conversation';
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

  it('renders a working placeholder inside the assistant card for an empty streaming response with no tool/reasoning entries', () => {
    const streamingItems: ConversationItem[] = [
      {
        kind: 'message',
        id: 'user-empty-stream',
        role: 'user',
        content: 'hello',
        timestamp: '2026-04-19T08:10:00.000Z',
        status: 'complete',
      },
      {
        kind: 'message',
        id: 'assistant-empty-stream',
        messageId: 'assistant-empty-stream',
        role: 'assistant',
        content: '',
        timestamp: 'streaming',
        status: 'streaming',
      },
    ];

    const { getByText, container } = render(<ConversationPanel items={streamingItems} isWorking workingLabel="Working..." />);

    expect(getByText('Working...')).toBeInTheDocument();
    expect(container.querySelector('.message-assistant-turn .working-placeholder')).not.toBeNull();
  });

  it('keeps assistant-card working feedback visible while tools stream and assistant text is still empty', () => {
    const streamingTurnItems: ConversationItem[] = [
      {
        kind: 'message',
        id: 'user-stream-tools',
        role: 'user',
        content: 'hello',
        timestamp: '2026-04-19T08:00:00.000Z',
        status: 'complete',
      },
      {
        kind: 'tool_call',
        id: 'tool-stream',
        messageId: 'assistant-stream-tools',
        toolCallId: 'tool-stream',
        toolName: 'bash',
        input: 'pwd',
        timestamp: '2026-04-19T08:00:00.500Z',
      },
      {
        kind: 'message',
        id: 'assistant-stream-tools',
        messageId: 'assistant-stream-tools',
        role: 'assistant',
        content: '',
        timestamp: 'streaming',
        status: 'streaming',
      },
    ];

    const { container, getByText } = render(<ConversationPanel items={streamingTurnItems} isWorking workingLabel="Working..." />);

    expect(getByText('Working...')).toBeInTheDocument();
    expect(container.querySelector('.message-assistant-turn .working-placeholder')).not.toBeNull();
    expect(container.querySelector('.tool-block')).not.toBeNull();
  });

  it('shows assistant-card working feedback only before streamed text arrives', () => {
    const streamingTurnItems: ConversationItem[] = [
      {
        kind: 'message',
        id: 'user-stream',
        role: 'user',
        content: 'hello',
        timestamp: '2026-04-19T08:00:00.000Z',
        status: 'complete',
      },
      {
        kind: 'message',
        id: 'assistant-stream',
        messageId: 'assistant-stream',
        role: 'assistant',
        content: 'Sto generando',
        timestamp: '2026-04-19T08:00:01.000Z',
        status: 'streaming',
      },
    ];

    const { container, queryByText } = render(<ConversationPanel items={streamingTurnItems} isWorking workingLabel="Working..." />);

    expect(container.querySelector('.message-assistant-turn .working-placeholder')).toBeNull();
    expect(queryByText('Working...')).toBeNull();
    expect(container.querySelector('.conversation-working-tail')).toBeNull();
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

  it('attaches a late user message to the matching assistant turn via messageId', () => {
    const delayedUserItems: ConversationItem[] = [
      {
        kind: 'thinking',
        id: 'thinking-late',
        messageId: 'turn-late',
        content: 'analyzing',
        done: true,
        timestamp: '2026-04-21T11:34:00.000Z',
      },
      {
        kind: 'message',
        id: 'assistant-late',
        messageId: 'turn-late',
        role: 'assistant',
        content: 'Siamo in /home/manu/pi-web-app.',
        timestamp: '2026-04-21T11:34:01.000Z',
        status: 'complete',
      },
      {
        kind: 'message',
        id: 'user-late',
        messageId: 'turn-late',
        role: 'user',
        content: 'in quale cwd siamo?',
        timestamp: '2026-04-21T11:33:59.000Z',
        status: 'complete',
      },
    ];

    const { container, getByText } = render(<ConversationPanel items={delayedUserItems} />);

    expect(container.querySelectorAll('.turn-item')).toHaveLength(1);
    expect(container.querySelector('.turn-user-header .message-user')).not.toBeNull();
    expect(getByText('in quale cwd siamo?')).toBeInTheDocument();
  });

  it('attaches a late user message even without messageId to the latest open turn', () => {
    const delayedUserItems: ConversationItem[] = [
      {
        kind: 'thinking',
        id: 'thinking-no-id',
        messageId: 'turn-no-id',
        content: 'analyzing',
        done: true,
        timestamp: '2026-04-21T11:34:00.000Z',
      },
      {
        kind: 'message',
        id: 'assistant-no-id',
        messageId: 'turn-no-id',
        role: 'assistant',
        content: 'Siamo in /home/manu/pi-web-app.',
        timestamp: '2026-04-21T11:34:01.000Z',
        status: 'complete',
      },
      {
        kind: 'message',
        id: 'user-no-id',
        role: 'user',
        content: 'in quale cwd siamo?',
        timestamp: '2026-04-21T11:33:59.000Z',
        status: 'complete',
      },
    ];

    const { container } = render(<ConversationPanel items={delayedUserItems} />);

    expect(container.querySelectorAll('.turn-item')).toHaveLength(1);
    expect(container.querySelector('.turn-user-header .message-user')).not.toBeNull();
    expect(container.querySelector('.message-assistant-turn')).toHaveTextContent('Siamo in /home/manu/pi-web-app.');
  });
});
