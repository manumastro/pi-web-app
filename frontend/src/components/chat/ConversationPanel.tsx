import React from 'react';
import { cn } from '@/lib/utils';
import type {
  ConversationItem,
  MessageItem,
  ThinkingItem,
  ToolCallItem,
  ToolResultItem,
} from '@/chatState';
import { FadeInOnReveal } from './message/FadeInOnReveal';
import { MessageHeader } from './message/MessageHeader';
import { MessageBody } from './message/MessageBody';
import { ReasoningPart } from './message/parts/ReasoningPart';
import { ToolPart } from './message/parts/ToolPart';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';
import { WorkingPlaceholder } from './components/WorkingPlaceholder';

interface ConversationPanelProps {
  items: ConversationItem[];
  error?: string;
  showReasoningTraces?: boolean;
  isWorking?: boolean;
  workingLabel?: string;
}

type AssistantMessageItem = MessageItem & { role: 'assistant' };
type UserMessageItem = MessageItem & { role: 'user' };
type SystemMessageItem = MessageItem & { role: 'system' };

type TurnRelatedItem = ThinkingItem | ToolCallItem | ToolResultItem | AssistantMessageItem;

type ToolTurnEntry =
  | { kind: 'assistant'; item: AssistantMessageItem }
  | { kind: 'thinking'; item: ThinkingItem }
  | { kind: 'tool'; call?: ToolCallItem; result?: ToolResultItem };

type RenderRecord =
  | { kind: 'user'; item: UserMessageItem; consumed: boolean }
  | { kind: 'standalone'; item: SystemMessageItem | AssistantMessageItem }
  | { kind: 'orphan'; item: ThinkingItem | ToolCallItem | ToolResultItem }
  | {
      kind: 'turn';
      turnId: string;
      userMessage?: UserMessageItem;
      entries: ToolTurnEntry[];
      firstTimestamp: string;
    };

function formatTimestamp(timestamp: string): string {
  if (timestamp === 'streaming') {
    return 'streaming';
  }

  try {
    return new Date(timestamp).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

function isUserMessage(item: ConversationItem): item is UserMessageItem {
  return item.kind === 'message' && item.role === 'user';
}

function isAssistantMessage(item: ConversationItem): item is AssistantMessageItem {
  return item.kind === 'message' && item.role === 'assistant';
}

function isSystemMessage(item: ConversationItem): item is SystemMessageItem {
  return item.kind === 'message' && item.role === 'system';
}

function getTurnId(item: TurnRelatedItem): string | undefined {
  if ('messageId' in item && typeof item.messageId === 'string' && item.messageId.trim().length > 0) {
    return item.messageId;
  }

  return undefined;
}

function getToolEntryKey(entry: ToolTurnEntry): string {
  if (entry.kind === 'assistant') {
    return entry.item.id;
  }

  if (entry.kind === 'thinking') {
    return entry.item.id;
  }

  return entry.call?.toolCallId ?? entry.result?.toolCallId ?? entry.call?.id ?? entry.result?.id ?? 'tool';
}

function groupToolEntry(entries: ToolTurnEntry[], item: ToolCallItem | ToolResultItem): void {
  const toolCallId = item.toolCallId;
  const existing = entries.find((entry) => entry.kind === 'tool' && (entry.call?.toolCallId === toolCallId || entry.result?.toolCallId === toolCallId));

  if (item.kind === 'tool_call') {
    if (existing && existing.kind === 'tool') {
      existing.call = item;
      return;
    }

    entries.push({ kind: 'tool', call: item });
    return;
  }

  if (existing && existing.kind === 'tool') {
    existing.result = item;
    return;
  }

  entries.push({ kind: 'tool', result: item });
}

function buildRenderRecords(items: ConversationItem[]): RenderRecord[] {
  const records: RenderRecord[] = [];
  const turns = new Map<string, Extract<RenderRecord, { kind: 'turn' }>>();
  let lastPendingUserRecord: Extract<RenderRecord, { kind: 'user' }> | undefined;

  const attachPendingUserToTurn = (turn: Extract<RenderRecord, { kind: 'turn' }>): void => {
    if (turn.userMessage || !lastPendingUserRecord || lastPendingUserRecord.consumed) {
      return;
    }

    turn.userMessage = lastPendingUserRecord.item;
    lastPendingUserRecord.consumed = true;
    lastPendingUserRecord = undefined;
  };

  const getOrCreateTurn = (turnId: string, timestamp: string): Extract<RenderRecord, { kind: 'turn' }> => {
    const existing = turns.get(turnId);
    if (existing) {
      return existing;
    }

    const turn: Extract<RenderRecord, { kind: 'turn' }> = {
      kind: 'turn',
      turnId,
      firstTimestamp: timestamp,
      entries: [],
    };
    turns.set(turnId, turn);
    records.push(turn);
    attachPendingUserToTurn(turn);
    return turn;
  };

  for (const item of items) {
    if (isUserMessage(item)) {
      const userRecord: Extract<RenderRecord, { kind: 'user' }> = {
        kind: 'user',
        item,
        consumed: false,
      };
      records.push(userRecord);
      lastPendingUserRecord = userRecord;
      continue;
    }

    if (isAssistantMessage(item)) {
      const turnId = getTurnId(item);
      if (turnId) {
        const turn = getOrCreateTurn(turnId, item.timestamp);
        turn.entries.push({ kind: 'assistant', item });
      } else {
        records.push({ kind: 'standalone', item });
      }
      continue;
    }

    if (item.kind === 'thinking' || item.kind === 'tool_call' || item.kind === 'tool_result') {
      const turnId = getTurnId(item);
      if (turnId) {
        const turn = getOrCreateTurn(turnId, item.timestamp);
        if (item.kind === 'thinking') {
          turn.entries.push({ kind: 'thinking', item });
        } else {
          groupToolEntry(turn.entries, item);
        }
      } else {
        records.push({ kind: 'orphan', item });
      }
      continue;
    }

    if (isSystemMessage(item)) {
      records.push({ kind: 'standalone', item });
      continue;
    }

    // Questions / permissions / errors are rendered elsewhere in App.
  }

  return records;
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

function renderStandaloneMessage(item: SystemMessageItem | AssistantMessageItem, showReasoningTraces: boolean): React.ReactElement {
  return (
    <FadeInOnReveal key={item.id} animate>
      <article
        className={cn(
          'message',
          item.role === 'assistant' ? 'message-assistant' : 'message-system',
          item.status === 'streaming' && 'streaming',
        )}
      >
        <MessageHeader role={item.role} timestamp={formatTimestamp(item.timestamp)} />
        <MessageBody item={item} showReasoningTraces={showReasoningTraces} />
      </article>
    </FadeInOnReveal>
  );
}

function renderToolEntry(entry: Extract<ToolTurnEntry, { kind: 'tool' }>): React.ReactElement {
  const toolName = entry.call?.toolName ?? 'result';
  const toolId = entry.call?.toolCallId ?? entry.result?.toolCallId ?? entry.call?.id ?? entry.result?.id ?? 'tool';
  const timestamp = entry.call?.timestamp ?? entry.result?.timestamp ?? 'streaming';
  return (
    <ToolPart
      key={getToolEntryKey(entry)}
      toolId={toolId}
      toolName={toolName}
      input={entry.call?.input}
      output={entry.result?.result}
      status={entry.result ? (entry.result.success ? 'success' : 'error') : 'pending'}
      timestamp={formatTimestamp(timestamp)}
    />
  );
}

function renderTurnEntry(entry: ToolTurnEntry, showReasoningTraces: boolean): React.ReactElement | null {
  if (entry.kind === 'assistant') {
    return (
      <div key={entry.item.id} className="message-assistant-entry">
        <MessageBody item={entry.item} showReasoningTraces={showReasoningTraces} />
      </div>
    );
  }

  if (entry.kind === 'thinking') {
    if (!showReasoningTraces) {
      return null;
    }

    return (
      <ReasoningPart
        key={entry.item.id}
        text={entry.item.content}
        variant="thinking"
        blockId={entry.item.id}
        done={entry.item.done}
        isStreaming={!entry.item.done}
      />
    );
  }

  return renderToolEntry(entry);
}

function AssistantTurn({
  turnId,
  userMessage,
  entries,
  firstTimestamp,
  showReasoningTraces,
  showWorkingPlaceholder,
  workingLabel,
}: {
  turnId: string;
  userMessage?: UserMessageItem;
  entries: ToolTurnEntry[];
  firstTimestamp: string;
  showReasoningTraces: boolean;
  showWorkingPlaceholder: boolean;
  workingLabel: string;
}) {
  const assistantTimestamp = entries.find((entry): entry is Extract<ToolTurnEntry, { kind: 'assistant' }> => entry.kind === 'assistant')?.item.timestamp ?? firstTimestamp;
  const hasStreamingEntry = entries.some((entry) => {
    if (entry.kind === 'assistant') {
      return entry.item.status === 'streaming';
    }

    if (entry.kind === 'thinking') {
      return !entry.item.done;
    }

    return !entry.result;
  });

  return (
    <section className="turn-item" id={`turn-${turnId}`} data-turn-id={turnId}>
      {userMessage ? (
        <div className="turn-user-header">
          <article className={cn('message', 'message-user')}>
            <MessageHeader role="user" timestamp={formatTimestamp(userMessage.timestamp)} />
            <MessageBody item={userMessage} showReasoningTraces={showReasoningTraces} />
          </article>
        </div>
      ) : null}

      <div className="turn-assistant-block">
        <FadeInOnReveal animate>
          <article
            className={cn('message', 'message-assistant-turn', hasStreamingEntry && 'streaming')}
            data-turn-id={turnId}
          >
            <MessageHeader role="assistant" timestamp={formatTimestamp(assistantTimestamp)} />

            {showWorkingPlaceholder ? (
              <WorkingPlaceholder label={workingLabel} className="mt-1" />
            ) : null}

            {entries.length > 0 ? (
              <div className="message-turn-stack">
                {entries.map((entry) => renderTurnEntry(entry, showReasoningTraces)).filter((entry): entry is React.ReactElement => Boolean(entry))}
              </div>
            ) : null}

          </article>
        </FadeInOnReveal>
      </div>
    </section>
  );
}

export function ConversationPanel({ items, error: errorMsg, showReasoningTraces = true, isWorking = false, workingLabel = 'Working...' }: ConversationPanelProps) {
  const records = React.useMemo(() => buildRenderRecords(items), [items]);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = React.useRef(true);
  const [showScrollButton, setShowScrollButton] = React.useState(false);

  const scrollToBottom = React.useCallback((instant = false) => {
    const el = panelRef.current;
    if (!el) {
      return;
    }

    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, []);

  React.useEffect(() => {
    const el = panelRef.current;
    if (!el) {
      return;
    }

    const updateScrollState = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distanceFromBottom < 120;
      shouldAutoScrollRef.current = atBottom;
      setShowScrollButton(!atBottom);
    };

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });

    return () => {
      el.removeEventListener('scroll', updateScrollState);
    };
  }, []);

  React.useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom(true);
    }
  }, [items.length, scrollToBottom]);

  const handleScrollToBottom = React.useCallback(() => {
    shouldAutoScrollRef.current = true;
    setShowScrollButton(false);
    scrollToBottom(false);
  }, [scrollToBottom]);

  const renderedRecords = records.flatMap((record) => {
    if (record.kind === 'user') {
      if (record.consumed) {
        return [];
      }

      return [
        <FadeInOnReveal key={record.item.id} animate>
          <article className={cn('message', 'message-user')}>
            <MessageHeader role="user" timestamp={formatTimestamp(record.item.timestamp)} />
            <MessageBody item={record.item} showReasoningTraces={showReasoningTraces} />
          </article>
        </FadeInOnReveal>,
      ];
    }

    if (record.kind === 'turn') {
      return [
        <AssistantTurn
          key={record.turnId}
          turnId={record.turnId}
          userMessage={record.userMessage}
          entries={record.entries}
          firstTimestamp={record.firstTimestamp}
          showReasoningTraces={showReasoningTraces}
          showWorkingPlaceholder={isWorking && record.entries.some((entry) => entry.kind === 'assistant' && entry.item.status === 'streaming' && entry.item.content.trim().length === 0)}
          workingLabel={workingLabel}
        />,
      ];
    }

    if (record.kind === 'orphan') {
      if (record.item.kind === 'thinking') {
        return showReasoningTraces
          ? [
              <ReasoningPart
                key={record.item.id}
                text={record.item.content}
                variant="thinking"
                blockId={record.item.id}
                done={record.item.done}
                isStreaming={!record.item.done}
              />,
            ]
          : [];
      }

      if (record.item.kind === 'tool_call') {
        return [
          <ToolPart
            key={record.item.id}
            toolId={record.item.toolCallId}
            toolName={record.item.toolName}
            input={record.item.input}
            status="pending"
            timestamp={formatTimestamp(record.item.timestamp)}
          />,
        ];
      }

      return [
        <ToolPart
          key={record.item.id}
          toolId={record.item.toolCallId}
          toolName="result"
          output={record.item.result}
          status={record.item.success ? 'success' : 'error'}
          timestamp={formatTimestamp(record.item.timestamp)}
        />,
      ];
    }

    return [renderStandaloneMessage(record.item, showReasoningTraces)];
  });

  return (
    <div className="messages-panel" role="log" aria-label="Conversation" aria-live="polite" ref={panelRef} style={{ position: 'relative' }}>
      {errorMsg ? (
        <div className="message message-error" role="alert">
          <div className="message-header">
            <span className="message-role">Error</span>
          </div>
          <div className="message-content">{errorMsg}</div>
        </div>
      ) : null}

      {items.length === 0 && !errorMsg ? <SkeletonConversation /> : null}

      {renderedRecords}

      <ScrollToBottomButton visible={showScrollButton} onClick={handleScrollToBottom} />
    </div>
  );
}

export default ConversationPanel;
