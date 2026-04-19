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
    content: '> Reasoning chunk 1.\n\n> Reasoning chunk 2',
    done: true,
    timestamp: '2026-04-19T07:56:01.000Z',
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
    result: '{"content":[{"type":"text","text":"/home/manu\\n"}]}',
    success: true,
    timestamp: '2026-04-19T07:56:01.800Z',
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
  it('renders thinking and tool output nested inside the matching assistant turn with cleaned output', () => {
    const { container, getByText, getAllByText } = render(<ConversationPanel items={items} />);

    expect(getByText('Ciao!')).toBeInTheDocument();
    expect(getByText('Thinking')).toBeInTheDocument();
    expect(getAllByText('bash')).toHaveLength(1);

    const toolBlocks = container.querySelectorAll('.message-tool');
    expect(toolBlocks).toHaveLength(1);

    const toolSummaries = container.querySelectorAll('.message-tool-summary-text');
    expect(toolSummaries[0]).toHaveTextContent('pwd');
    expect(container.querySelectorAll('.message-tool-section')).toHaveLength(2);
    expect(container.querySelectorAll('.message-tool-section .message-badge')[0]).toHaveTextContent('Input');
    expect(container.querySelectorAll('.message-tool-section .message-badge')[1]).toHaveTextContent('Output');
    expect(container.querySelectorAll('.message-tool-code')[0]).toHaveTextContent('pwd');
    expect(container.querySelectorAll('.message-tool-code')[1]).toHaveTextContent('/home/manu');

    const summary = container.querySelector('.message-thinking-summary-text');
    expect(summary).toHaveTextContent('Reasoning chunk 1');

    const body = container.querySelector('.message-thinking-body');
    expect(body).toHaveTextContent(/Reasoning chunk 1\.\s+Reasoning chunk 2/);

    const topLevelMessages = [...container.querySelectorAll('.messages-panel > .message')];
    expect(topLevelMessages).toHaveLength(2);
    expect(topLevelMessages[0]).toHaveClass('message-user');
    expect(topLevelMessages[1]).toHaveClass('message-assistant-turn');

    const assistantTurn = container.querySelector('.message-assistant-turn');
    expect(assistantTurn).not.toBeNull();
    const nestedBlocks = [...assistantTurn!.querySelectorAll('.message-turn-stack > .message')];
    expect(nestedBlocks[0]).toHaveClass('message-thinking');
    expect(nestedBlocks[1]).toHaveClass('message-tool', 'message-tool-tool_call');
  });

  it('renders reasoning before tool output when session history arrives in tool-first order', () => {
    const reorderedItems: ConversationItem[] = [
      {
        kind: 'message',
        id: 'user-4',
        role: 'user',
        content: 'in che cwd siamo?',
        timestamp: '2026-04-19T07:56:00.000Z',
        status: 'complete',
      },
      {
        kind: 'tool_call',
        id: 'tool-call-4',
        toolCallId: 'tool-call-4',
        messageId: 'assistant-4',
        toolName: 'bash',
        input: 'pwd',
        timestamp: '2026-04-19T07:56:01.500Z',
      },
      {
        kind: 'tool_result',
        id: 'tool-call-4-result',
        toolCallId: 'tool-call-4',
        messageId: 'assistant-4',
        result: '{"content":[{"type":"text","text":"/home/manu\\n"}]}',
        success: true,
        timestamp: '2026-04-19T07:56:01.800Z',
      },
      {
        kind: 'thinking',
        id: 'thinking-4',
        messageId: 'assistant-4',
        content: '> checking cwd',
        done: true,
        timestamp: '2026-04-19T07:56:01.900Z',
      },
      {
        kind: 'message',
        id: 'assistant-4',
        messageId: 'assistant-4',
        role: 'assistant',
        content: 'Siamo in `/home/manu`.',
        timestamp: '2026-04-19T07:56:02.000Z',
        status: 'complete',
      },
    ];

    const { container } = render(<ConversationPanel items={reorderedItems} />);
    const assistantTurn = container.querySelector('.message-assistant-turn');
    expect(assistantTurn).not.toBeNull();

    const nestedBlocks = [...assistantTurn!.querySelectorAll('.message-turn-stack > .message')];
    expect(nestedBlocks).toHaveLength(2);
    expect(nestedBlocks[0]).toHaveClass('message-thinking');
    expect(nestedBlocks[1]).toHaveClass('message-tool', 'message-tool-tool_call');
    expect(container.querySelectorAll('.message-tool-code')[1]).toHaveTextContent('/home/manu');
    expect(assistantTurn).toHaveTextContent('Siamo in `/home/manu`.');
  });

  it('hides empty streaming assistant placeholders when tool output is attached to the same turn', () => {
    const linkedItems: ConversationItem[] = [
      {
        kind: 'message',
        id: 'user-2',
        role: 'user',
        content: 'cwd?',
        timestamp: '2026-04-19T07:56:00.000Z',
        status: 'complete',
      },
      {
        kind: 'message',
        id: 'assistant-2',
        messageId: 'assistant-2',
        role: 'assistant',
        content: '',
        timestamp: 'streaming',
        status: 'streaming',
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
        result: '{"content":[{"type":"text","text":"/home/manu\\n"}]}',
        success: true,
        timestamp: '2026-04-19T07:56:01.800Z',
      },
    ];

    const { container, getAllByText } = render(<ConversationPanel items={linkedItems} />);

    expect(getAllByText('bash')).toHaveLength(1);
    const toolBlocks = container.querySelectorAll('.message-tool');
    expect(toolBlocks).toHaveLength(1);
    const toolSummaries = container.querySelectorAll('.message-tool-summary-text');
    expect(toolSummaries[0]).toHaveTextContent('pwd');
    expect(container.querySelectorAll('.message-tool-section')).toHaveLength(2);
    expect(container.querySelectorAll('.message-tool-code')[0]).toHaveTextContent('pwd');
    expect(container.querySelectorAll('.message-tool-code')[1]).toHaveTextContent('/home/manu');

    const assistantTurn = container.querySelector('.message-assistant-turn');
    expect(assistantTurn).not.toBeNull();
    expect(assistantTurn?.querySelector('.message-content')).toBeNull();
  });

  it('preserves the original event order inside a linked assistant turn', () => {
    const orderedItems: ConversationItem[] = [
      {
        kind: 'message',
        id: 'user-3',
        role: 'user',
        content: 'run a couple tools',
        timestamp: '2026-04-19T07:56:00.000Z',
        status: 'complete',
      },
      {
        kind: 'message',
        id: 'assistant-3',
        messageId: 'assistant-3',
        role: 'assistant',
        content: 'Done.',
        timestamp: '2026-04-19T07:56:03.000Z',
        status: 'complete',
      },
      {
        kind: 'tool_call',
        id: 'tool-call-3',
        toolCallId: 'tool-call-3',
        messageId: 'assistant-3',
        toolName: 'bash',
        input: 'pwd',
        timestamp: '2026-04-19T07:56:01.000Z',
      },
      {
        kind: 'thinking',
        id: 'thinking-3',
        messageId: 'assistant-3',
        content: '> checking cwd',
        done: true,
        timestamp: '2026-04-19T07:56:01.200Z',
      },
      {
        kind: 'tool_result',
        id: 'tool-call-3-result',
        toolCallId: 'tool-call-3',
        messageId: 'assistant-3',
        result: '{"content":[{"type":"text","text":"/home/manu\\n"}]}',
        success: true,
        timestamp: '2026-04-19T07:56:01.400Z',
      },
    ];

    const { container } = render(<ConversationPanel items={orderedItems} />);

    const assistantTurn = container.querySelector('.message-assistant-turn');
    expect(assistantTurn).not.toBeNull();

    const nestedBlocks = [...assistantTurn!.querySelectorAll('.message-turn-stack > .message')];
    expect(nestedBlocks).toHaveLength(2);
    expect(nestedBlocks[0]).toHaveClass('message-thinking');
    expect(nestedBlocks[1]).toHaveClass('message-tool', 'message-tool-tool_call');
  });
});
