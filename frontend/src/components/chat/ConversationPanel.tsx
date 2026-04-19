import type { ReactElement } from 'react';
import type { ConversationItem, MessageItem, ToolCallItem, ToolResultItem, ThinkingItem } from '@/chatState';
import ThinkingBlock from './ThinkingBlock';
import ToolBlock from './ToolBlock';

interface ConversationPanelProps {
  items: ConversationItem[];
  error?: string;
}

function formatTimestamp(timestamp: string): string {
  return timestamp === 'streaming'
    ? 'streaming'
    : new Date(timestamp).toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function roleLabel(role: string): string {
  return role === 'user' ? 'You' : role === 'assistant' ? 'Assistant' : role;
}

function isTurnRelatedItem(item: ConversationItem): item is Extract<ConversationItem, { kind: 'thinking' | 'tool_call' | 'tool_result' }> {
  return item.kind === 'thinking' || item.kind === 'tool_call' || item.kind === 'tool_result';
}

function getTurnItems(items: ConversationItem[], messageId?: string): ConversationItem[] {
  if (!messageId) {
    return [];
  }

  return items.filter((item) => isTurnRelatedItem(item) && item.messageId === messageId);
}

function SkeletonConversation() {
  return (
    <div className="conversation-empty" aria-hidden="true">
      <div className="conversation-skeleton">
        <div className="conversation-skeleton-row">
          <span className="conversation-skeleton-dot" />
          <span className="conversation-skeleton-line w-44" />
          <span className="conversation-skeleton-line w-64" />
        </div>
        <div className="conversation-skeleton-row">
          <span className="conversation-skeleton-dot" />
          <span className="conversation-skeleton-line w-28" />
          <span className="conversation-skeleton-line w-80" />
          <span className="conversation-skeleton-line w-72" />
        </div>
        <div className="conversation-skeleton-row">
          <span className="conversation-skeleton-dot" />
          <span className="conversation-skeleton-line w-36" />
          <span className="conversation-skeleton-line w-52" />
        </div>
      </div>
    </div>
  );
}

type AssistantMessageItem = MessageItem & { role: 'assistant' };

type TurnRelatedItem = Extract<ConversationItem, { kind: 'thinking' | 'tool_call' | 'tool_result' }>;

type ToolTurnEntry =
  | { kind: 'thinking'; item: ThinkingItem }
  | { kind: 'tool'; call?: ToolCallItem; result?: ToolResultItem };

function isAssistantMessage(item: ConversationItem): item is AssistantMessageItem {
  return item.kind === 'message' && item.role === 'assistant';
}

function sortTurnItems(items: TurnRelatedItem[]): TurnRelatedItem[] {
  const rank = (item: TurnRelatedItem): number => {
    switch (item.kind) {
      case 'thinking':
        return 0;
      case 'tool_call':
        return 1;
      case 'tool_result':
        return 2;
      default:
        return 3;
    }
  };

  return [...items].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    if (byRank !== 0) {
      return byRank;
    }
    return left.timestamp.localeCompare(right.timestamp);
  });
}

function groupTurnItems(items: TurnRelatedItem[]): ToolTurnEntry[] {
  const entries: ToolTurnEntry[] = [];
  const toolEntriesById = new Map<string, ToolTurnEntry>();

  for (const item of sortTurnItems(items)) {
    if (item.kind === 'thinking') {
      entries.push({ kind: 'thinking', item });
      continue;
    }

    if (item.kind === 'tool_call') {
      const entry: ToolTurnEntry = { kind: 'tool', call: item };
      entries.push(entry);
      toolEntriesById.set(item.toolCallId, entry);
      continue;
    }

    const existing = toolEntriesById.get(item.toolCallId);
    if (existing && existing.kind === 'tool') {
      existing.result = item;
      continue;
    }

    const entry: ToolTurnEntry = { kind: 'tool', result: item };
    entries.push(entry);
    toolEntriesById.set(item.toolCallId, entry);
  }

  return entries;
}

function renderGroupedTurnItem(entry: ToolTurnEntry): ReactElement | null {
  if (entry.kind === 'thinking') {
    return <ThinkingBlock key={entry.item.id} item={entry.item} />;
  }

  if (entry.call) {
    return (
      <ToolBlock
        key={entry.call.id}
        kind="tool_call"
        toolName={entry.call.toolName}
        time={formatTimestamp(entry.call.timestamp)}
        content={entry.call.input}
        result={entry.result ? {
          content: entry.result.result,
          time: formatTimestamp(entry.result.timestamp),
          tone: entry.result.success ? 'success' : 'error',
        } : undefined}
      />
    );
  }

  if (entry.result) {
    return (
      <ToolBlock
        key={entry.result.id}
        kind="tool_result"
        toolName={entry.result.success ? 'result' : 'error'}
        time={formatTimestamp(entry.result.timestamp)}
        content={entry.result.result}
        tone={entry.result.success ? 'success' : 'error'}
      />
    );
  }

  return null;
}

function renderStandaloneTurnItem(item: TurnRelatedItem): ReactElement | null {
  if (item.kind === 'thinking') {
    return <ThinkingBlock key={item.id} item={item} />;
  }

  if (item.kind === 'tool_call') {
    return (
      <ToolBlock
        key={item.id}
        kind="tool_call"
        toolName={item.toolName}
        time={formatTimestamp(item.timestamp)}
        content={item.input}
      />
    );
  }

  return (
    <ToolBlock
      key={item.id}
      kind="tool_result"
      toolName={item.success ? 'result' : 'error'}
      time={formatTimestamp(item.timestamp)}
      content={item.result}
      tone={item.success ? 'success' : 'error'}
    />
  );
}

function AssistantTurn({ items, assistant }: { items: ConversationItem[]; assistant: AssistantMessageItem }) {
  const turnItems = groupTurnItems(getTurnItems(items, assistant.messageId) as TurnRelatedItem[]);
  const hasAuxiliaryItems = turnItems.length > 0;
  const content = assistant.content.trim();
  const showContent = content.length > 0 || (!hasAuxiliaryItems && assistant.status !== 'streaming');

  return (
    <article className={`message message-assistant-turn ${assistant.status === 'streaming' ? 'streaming' : ''}`} key={assistant.id}>
      <div className="message-header">
        <span className="message-role">{roleLabel(assistant.role)}</span>
        <span className="message-time">{formatTimestamp(assistant.timestamp)}</span>
      </div>

      {hasAuxiliaryItems && (
        <div className="message-turn-stack">
          {turnItems.map((item) => renderGroupedTurnItem(item))}
        </div>
      )}

      {showContent && <div className="message-content message-assistant-body">{content || (assistant.status === 'streaming' ? '…' : '—')}</div>}
    </article>
  );
}

export function ConversationPanel({ items, error: errorMsg }: ConversationPanelProps) {
  const assistantIds = new Set(
    items
      .filter((item): item is AssistantMessageItem => isAssistantMessage(item) && typeof item.messageId === 'string')
      .map((item) => item.messageId as string),
  );

  const renderedTurnIds = new Set<string>();

  return (
    <div className="messages-panel" role="log" aria-label="Conversation" aria-live="polite">
      {errorMsg && (
        <div className="message message-error" role="alert">
          <div className="message-header">
            <span className="message-role">Error</span>
          </div>
          <div className="message-content">{errorMsg}</div>
        </div>
      )}

      {items.length === 0 && !errorMsg && <SkeletonConversation />}

      {items.map((item) => {
        if (isAssistantMessage(item)) {
          if (item.messageId && renderedTurnIds.has(item.messageId)) {
            return null;
          }

          if (item.messageId) {
            renderedTurnIds.add(item.messageId);
          }

          return <AssistantTurn key={item.id} items={items} assistant={item} />;
        }

        if (isTurnRelatedItem(item)) {
          if (item.messageId && assistantIds.has(item.messageId)) {
            return null;
          }

          return renderStandaloneTurnItem(item);
        }

        if (item.kind === 'message') {
          return (
            <article
              key={item.id}
              className={`message ${item.role === 'user' ? 'message-user' : 'message-system'} ${
                item.status === 'streaming' ? 'streaming' : ''
              }`}
            >
              <div className="message-header">
                <span className="message-role">{roleLabel(item.role)}</span>
                <span className="message-time">{formatTimestamp(item.timestamp)}</span>
              </div>
              <div className="message-content">{item.content || (item.status === 'streaming' ? '…' : '—')}</div>
            </article>
          );
        }

        return null;
      })}
    </div>
  );
}

export default ConversationPanel;
