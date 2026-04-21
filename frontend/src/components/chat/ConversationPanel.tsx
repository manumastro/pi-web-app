import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import type {
  ConversationItem,
  MessageItem,
  ThinkingItem,
  ToolCallItem,
  ToolResultItem,
} from '@/sync/conversation';
import { FadeInOnReveal } from './message/FadeInOnReveal';
import { MessageHeader } from './message/MessageHeader';
import { MessageBody } from './message/MessageBody';
import { ReasoningPart } from './message/parts/ReasoningPart';
import { ToolPart } from './message/parts/ToolPart';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';
import { WorkingPlaceholder } from './components/WorkingPlaceholder';
import type { StreamPhase } from '@/sync/streaming';

interface ConversationPanelProps {
  items: ConversationItem[];
  error?: string;
  showReasoningTraces?: boolean;
  isWorking?: boolean;
  workingLabel?: string;
  workingStatusText?: string | null;
  workingActivity?: 'idle' | 'streaming' | 'tooling' | 'permission' | 'retry' | 'cooldown' | 'complete';
  activeStreamingMessageId?: string;
  activeStreamingPhase?: StreamPhase;
}

type AssistantMessageItem = MessageItem & { role: 'assistant' };
type UserMessageItem = MessageItem & { role: 'user' };
type SystemMessageItem = MessageItem & { role: 'system' };

type TurnRelatedItem = ThinkingItem | ToolCallItem | ToolResultItem | AssistantMessageItem;

type ToolTurnEntry =
  | { kind: 'assistant'; item: AssistantMessageItem }
  | { kind: 'thinking'; item: ThinkingItem }
  | { kind: 'tool'; call?: ToolCallItem; result?: ToolResultItem };

const HISTORY_VIRTUALIZE_THRESHOLD = 40;
const HISTORY_OVERSCAN = 6;

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
  const pendingUsersByTurnId = new Map<string, Extract<RenderRecord, { kind: 'user' }>>();
  let lastPendingUserRecord: Extract<RenderRecord, { kind: 'user' }> | undefined;

  const attachPendingUserToTurn = (turn: Extract<RenderRecord, { kind: 'turn' }>): void => {
    if (turn.userMessage) {
      return;
    }

    const matchedPending = pendingUsersByTurnId.get(turn.turnId);
    if (matchedPending && !matchedPending.consumed) {
      turn.userMessage = matchedPending.item;
      matchedPending.consumed = true;
      pendingUsersByTurnId.delete(turn.turnId);
      if (lastPendingUserRecord?.item.id === matchedPending.item.id) {
        lastPendingUserRecord = undefined;
      }
      return;
    }

    if (!lastPendingUserRecord || lastPendingUserRecord.consumed) {
      return;
    }

    turn.userMessage = lastPendingUserRecord.item;
    lastPendingUserRecord.consumed = true;
    if (lastPendingUserRecord.item.messageId) {
      pendingUsersByTurnId.delete(lastPendingUserRecord.item.messageId);
    }
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
      const userTurnId = item.messageId?.trim() || undefined;
      if (userTurnId) {
        const existingTurn = turns.get(userTurnId);
        if (existingTurn && !existingTurn.userMessage) {
          existingTurn.userMessage = item;
          continue;
        }
      } else {
        const latestTurnWithoutUser = records.reduce<Extract<RenderRecord, { kind: 'turn' }> | undefined>((candidate, record) => {
          if (record.kind !== 'turn' || record.userMessage) {
            return candidate;
          }
          return record;
        }, undefined);

        if (latestTurnWithoutUser) {
          latestTurnWithoutUser.userMessage = item;
          continue;
        }
      }

      const userRecord: Extract<RenderRecord, { kind: 'user' }> = {
        kind: 'user',
        item,
        consumed: false,
      };
      records.push(userRecord);
      lastPendingUserRecord = userRecord;
      if (userTurnId) {
        pendingUsersByTurnId.set(userTurnId, userRecord);
      }
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

  // Attach the last pending user record to the last turn that has no user entry.
  // This handles cases where a user message was sent but the backend didn't
  // store its id on the assistant message, so the user wasn't linked.
  if (lastPendingUserRecord && !lastPendingUserRecord.consumed) {
    const turnsWithoutUser = records.filter(
      (r): r is Extract<RenderRecord, { kind: 'turn' }> =>
        r.kind === 'turn' && !r.userMessage,
    );
    const lastTurn = turnsWithoutUser.at(-1);
    if (lastTurn) {
      lastTurn.userMessage = lastPendingUserRecord.item;
      lastPendingUserRecord.consumed = true;
    }
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

function hasStreamingTurnEntry(entry: ToolTurnEntry): boolean {
  if (entry.kind === 'assistant') {
    return entry.item.status === 'streaming';
  }

  if (entry.kind === 'thinking') {
    return !entry.item.done;
  }

  return !entry.result;
}

function isStreamingRecord(record: RenderRecord | undefined, activeStreamingMessageId?: string, activeStreamingPhase?: StreamPhase): boolean {
  if (activeStreamingMessageId && (activeStreamingPhase === 'streaming' || activeStreamingPhase === 'cooldown')) {
    if (record?.kind === 'turn') {
      return record.turnId === activeStreamingMessageId;
    }
    if (record?.kind === 'standalone' && record.item.role === 'assistant') {
      return (record.item.messageId ?? record.item.id) === activeStreamingMessageId;
    }
  }
  if (!record) {
    return false;
  }

  if (record.kind === 'turn') {
    return record.entries.some(hasStreamingTurnEntry);
  }

  if (record.kind === 'standalone') {
    return record.item.role === 'assistant' && record.item.status === 'streaming';
  }

  if (record.kind === 'orphan') {
    if (record.item.kind === 'thinking') {
      return !record.item.done;
    }
    if (record.item.kind === 'tool_call') {
      return true;
    }
    return false;
  }

  return false;
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

const AssistantTurn = React.memo(function AssistantTurn({
  turnId,
  userMessage,
  entries,
  firstTimestamp,
  showReasoningTraces,
  showWorkingPlaceholder,
  workingLabel,
  workingStatusText,
  workingActivity,
}: {
  turnId: string;
  userMessage?: UserMessageItem;
  entries: ToolTurnEntry[];
  firstTimestamp: string;
  showReasoningTraces: boolean;
  showWorkingPlaceholder: boolean;
  workingLabel: string;
  workingStatusText?: string | null;
  workingActivity?: 'idle' | 'streaming' | 'tooling' | 'permission' | 'retry' | 'cooldown' | 'complete';
}) {
  const assistantTimestamp = entries.find((entry): entry is Extract<ToolTurnEntry, { kind: 'assistant' }> => entry.kind === 'assistant')?.item.timestamp ?? firstTimestamp;
  const hasStreamingEntry = entries.some(hasStreamingTurnEntry);
  const nonAssistantEntries = entries.filter((entry) => entry.kind !== 'assistant');
  const assistantEntries = entries.filter((entry): entry is Extract<ToolTurnEntry, { kind: 'assistant' }> => entry.kind === 'assistant');
  const orderedEntries: ToolTurnEntry[] = [...nonAssistantEntries, ...assistantEntries];
  const hasNonAssistantEntries = nonAssistantEntries.length > 0;

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
              <WorkingPlaceholder label={workingLabel} statusText={workingStatusText} activity={workingActivity} className="mt-1" />
            ) : null}

            {orderedEntries.length > 0 ? (
              <div className="message-turn-stack">
                {orderedEntries.map((entry) => renderTurnEntry(entry, showReasoningTraces)).filter((entry): entry is React.ReactElement => Boolean(entry))}
              </div>
            ) : null}

          </article>
        </FadeInOnReveal>
      </div>
    </section>
  );
}, (prev, next) => {
  if (prev.turnId !== next.turnId) return false;
  if (prev.firstTimestamp !== next.firstTimestamp) return false;
  if (prev.showReasoningTraces !== next.showReasoningTraces) return false;
  if (prev.showWorkingPlaceholder !== next.showWorkingPlaceholder) return false;
  if (prev.workingLabel !== next.workingLabel) return false;
  if (prev.workingStatusText !== next.workingStatusText) return false;
  if (prev.workingActivity !== next.workingActivity) return false;
  if (prev.userMessage !== next.userMessage) return false;
  if (prev.entries.length !== next.entries.length) return false;

  return prev.entries.every((entry, index) => {
    const other = next.entries[index];
    if (!other || entry.kind !== other.kind) return false;
    if (entry.kind === 'assistant' && other.kind === 'assistant') {
      return entry.item === other.item;
    }
    if (entry.kind === 'thinking' && other.kind === 'thinking') {
      return entry.item === other.item;
    }
    if (entry.kind === 'tool' && other.kind === 'tool') {
      return entry.call === other.call && entry.result === other.result;
    }
    return false;
  });
});

function estimateRecordHeight(record: RenderRecord | undefined): number {
  if (!record) return 180;
  if (record.kind === 'turn') {
    return 180 + Math.min(record.entries.length, 5) * 96;
  }
  if (record.kind === 'user' || record.kind === 'standalone') {
    return 140;
  }
  return 120;
}

function wrapStaticHistoryNode(key: string, node: React.ReactElement): React.ReactElement {
  return (
    <div
      key={key}
      className="history-record history-record-static"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '320px' }}
    >
      {node}
    </div>
  );
}

function areRenderRecordsEquivalent(left: RenderRecord[], right: RenderRecord[]): boolean {
  if (left.length !== right.length) return false;

  return left.every((record, index) => {
    const other = right[index];
    if (!other || record.kind !== other.kind) return false;

    if (record.kind === 'user' && other.kind === 'user') {
      return record.item === other.item && record.consumed === other.consumed;
    }

    if (record.kind === 'standalone' && other.kind === 'standalone') {
      return record.item === other.item;
    }

    if (record.kind === 'orphan' && other.kind === 'orphan') {
      return record.item === other.item;
    }

    if (record.kind === 'turn' && other.kind === 'turn') {
      if (record.turnId !== other.turnId) return false;
      if (record.userMessage !== other.userMessage) return false;
      if (record.entries.length !== other.entries.length) return false;
      return record.entries.every((entry, entryIndex) => {
        const otherEntry = other.entries[entryIndex];
        if (!otherEntry || entry.kind !== otherEntry.kind) return false;
        if (entry.kind === 'assistant' && otherEntry.kind === 'assistant') return entry.item === otherEntry.item;
        if (entry.kind === 'thinking' && otherEntry.kind === 'thinking') return entry.item === otherEntry.item;
        if (entry.kind === 'tool' && otherEntry.kind === 'tool') return entry.call === otherEntry.call && entry.result === otherEntry.result;
        return false;
      });
    }

    return false;
  });
}

const StaticHistoryList = React.memo(function StaticHistoryList({
  records,
  showReasoningTraces,
  isWorking,
  workingLabel,
  workingStatusText,
  workingActivity,
  scrollParentRef,
}: {
  records: RenderRecord[];
  showReasoningTraces: boolean;
  isWorking: boolean;
  workingLabel: string;
  workingStatusText?: string | null;
  workingActivity?: 'idle' | 'streaming' | 'tooling' | 'permission' | 'retry' | 'cooldown' | 'complete';
  scrollParentRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const shouldVirtualize = records.length >= HISTORY_VIRTUALIZE_THRESHOLD && Boolean(scrollParentRef?.current);
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? records.length : 0,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: (index) => estimateRecordHeight(records[index]),
    overscan: HISTORY_OVERSCAN,
  });

  const renderRecord = (record: RenderRecord) => {
    if (record.kind === 'user') {
      if (record.consumed) {
        return [];
      }

      return [
        wrapStaticHistoryNode(
          record.item.id,
          <FadeInOnReveal animate>
            <article className={cn('message', 'message-user')}>
              <MessageHeader role="user" timestamp={formatTimestamp(record.item.timestamp)} />
              <MessageBody item={record.item} showReasoningTraces={showReasoningTraces} />
            </article>
          </FadeInOnReveal>,
        ),
      ];
    }

    if (record.kind === 'turn') {
      return [
        wrapStaticHistoryNode(
          record.turnId,
          <AssistantTurn
            turnId={record.turnId}
            userMessage={record.userMessage}
            entries={record.entries}
            firstTimestamp={record.firstTimestamp}
            showReasoningTraces={showReasoningTraces}
            showWorkingPlaceholder={
              isWorking
              && record.entries.some((entry) => entry.kind === 'assistant' && entry.item.status === 'streaming')
              && !record.entries.some((entry) => entry.kind === 'assistant' && entry.item.content.trim().length > 0)
            }
            workingLabel={workingLabel}
            workingStatusText={workingStatusText}
            workingActivity={workingActivity}
          />,
        ),
      ];
    }

    if (record.kind === 'orphan') {
      if (record.item.kind === 'thinking') {
        return showReasoningTraces
          ? [
              wrapStaticHistoryNode(
                record.item.id,
                <ReasoningPart
                  text={record.item.content}
                  variant="thinking"
                  blockId={record.item.id}
                  done={record.item.done}
                  isStreaming={!record.item.done}
                />,
              ),
            ]
          : [];
      }

      if (record.item.kind === 'tool_call') {
        return [
          wrapStaticHistoryNode(
            record.item.id,
            <ToolPart
              toolId={record.item.toolCallId}
              toolName={record.item.toolName}
              input={record.item.input}
              status="pending"
              timestamp={formatTimestamp(record.item.timestamp)}
            />,
          ),
        ];
      }

      return [
        wrapStaticHistoryNode(
          record.item.id,
          <ToolPart
            toolId={record.item.toolCallId}
            toolName="result"
            output={record.item.result}
            status={record.item.success ? 'success' : 'error'}
            timestamp={formatTimestamp(record.item.timestamp)}
          />,
        ),
      ];
    }

    return [wrapStaticHistoryNode(record.item.id, renderStandaloneMessage(record.item, showReasoningTraces))];
  };

  if (!shouldVirtualize) {
    return records.flatMap((record) => renderRecord(record));
  }

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom = virtualRows.length > 0
    ? Math.max(0, virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0))
    : 0;

  return (
    <div className="virtualized-history-list">
      {paddingTop > 0 ? <div aria-hidden="true" style={{ height: `${paddingTop}px` }} /> : null}
      {virtualRows.map((row) => {
        const record = records[row.index];
        if (!record) {
          return null;
        }
        return (
          <div key={row.key} ref={virtualizer.measureElement} data-index={row.index}>
            {renderRecord(record)}
          </div>
        );
      })}
      {paddingBottom > 0 ? <div aria-hidden="true" style={{ height: `${paddingBottom}px` }} /> : null}
    </div>
  );
}, (prev, next) => {
  return prev.showReasoningTraces === next.showReasoningTraces
    && prev.isWorking === next.isWorking
    && prev.workingLabel === next.workingLabel
    && prev.workingStatusText === next.workingStatusText
    && prev.workingActivity === next.workingActivity
    && areRenderRecordsEquivalent(prev.records, next.records);
});

const StreamingTailContent = React.memo(function StreamingTailContent({
  record,
  showReasoningTraces,
  isWorking,
  workingLabel,
  workingStatusText,
  workingActivity,
}: {
  record: RenderRecord;
  showReasoningTraces: boolean;
  isWorking: boolean;
  workingLabel: string;
  workingStatusText?: string | null;
  workingActivity?: 'idle' | 'streaming' | 'tooling' | 'permission' | 'retry' | 'cooldown' | 'complete';
}) {
  if (record.kind === 'user') {
    if (record.consumed) {
      return null;
    }

    return (
      <div className="streaming-tail-content" data-streaming-tail="user">
        <FadeInOnReveal animate>
          <article className={cn('message', 'message-user')}>
            <MessageHeader role="user" timestamp={formatTimestamp(record.item.timestamp)} />
            <MessageBody item={record.item} showReasoningTraces={showReasoningTraces} />
          </article>
        </FadeInOnReveal>
      </div>
    );
  }

  if (record.kind === 'turn') {
    return (
      <div className="streaming-tail-content" data-streaming-tail="turn">
        <AssistantTurn
          turnId={record.turnId}
          userMessage={record.userMessage}
          entries={record.entries}
          firstTimestamp={record.firstTimestamp}
          showReasoningTraces={showReasoningTraces}
          showWorkingPlaceholder={
            isWorking
            && record.entries.some((entry) => entry.kind === 'assistant' && entry.item.status === 'streaming')
            && !record.entries.some((entry) => entry.kind === 'assistant' && entry.item.content.trim().length > 0)
          }
          workingLabel={workingLabel}
          workingStatusText={workingStatusText}
          workingActivity={workingActivity}
        />
      </div>
    );
  }

  if (record.kind === 'orphan') {
    if (record.item.kind === 'thinking') {
      return showReasoningTraces ? (
        <div className="streaming-tail-content" data-streaming-tail="thinking">
          <ReasoningPart text={record.item.content} variant="thinking" blockId={record.item.id} done={record.item.done} isStreaming={!record.item.done} />
        </div>
      ) : null;
    }

    if (record.item.kind === 'tool_call') {
      return (
        <div className="streaming-tail-content" data-streaming-tail="tool">
          <ToolPart toolId={record.item.toolCallId} toolName={record.item.toolName} input={record.item.input} status="pending" timestamp={formatTimestamp(record.item.timestamp)} />
        </div>
      );
    }

    return (
      <div className="streaming-tail-content" data-streaming-tail="tool-result">
        <ToolPart toolId={record.item.toolCallId} toolName="result" output={record.item.result} status={record.item.success ? 'success' : 'error'} timestamp={formatTimestamp(record.item.timestamp)} />
      </div>
    );
  }

  return <div className="streaming-tail-content" data-streaming-tail="standalone">{renderStandaloneMessage(record.item, showReasoningTraces)}</div>;
}, (prev, next) => {
  return prev.showReasoningTraces === next.showReasoningTraces
    && prev.isWorking === next.isWorking
    && prev.workingLabel === next.workingLabel
    && prev.workingStatusText === next.workingStatusText
    && prev.workingActivity === next.workingActivity
    && prev.record === next.record;
});

export function ConversationPanel({ items, error: errorMsg, showReasoningTraces = true, isWorking = false, workingLabel = 'Working...', workingStatusText, workingActivity = 'streaming', activeStreamingMessageId, activeStreamingPhase }: ConversationPanelProps) {
  const records = React.useMemo(() => buildRenderRecords(items), [items]);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = React.useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = React.useRef(true);
  const [showScrollButton, setShowScrollButton] = React.useState(false);

  const scrollToBottom = React.useCallback((instant = false) => {
    const anchor = bottomAnchorRef.current;
    if (anchor && typeof anchor.scrollIntoView === 'function') {
      anchor.scrollIntoView({ block: 'end', behavior: instant ? 'auto' : 'smooth' });
      return;
    }

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

  React.useLayoutEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      scrollToBottom(true);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [items, scrollToBottom]);

  const handleScrollToBottom = React.useCallback(() => {
    shouldAutoScrollRef.current = true;
    setShowScrollButton(false);
    scrollToBottom(false);
  }, [scrollToBottom]);

  const trailingStreamingRecord = React.useMemo(() => {
    if (activeStreamingMessageId && (activeStreamingPhase === 'streaming' || activeStreamingPhase === 'cooldown')) {
      const matched = records.find((record) => isStreamingRecord(record, activeStreamingMessageId, activeStreamingPhase));
      if (matched) {
        return matched;
      }
    }

    const lastRecord = records.at(-1);
    return isStreamingRecord(lastRecord, activeStreamingMessageId, activeStreamingPhase) ? lastRecord : undefined;
  }, [activeStreamingMessageId, activeStreamingPhase, records]);

  const historyRecords = React.useMemo(() => {
    if (!trailingStreamingRecord) {
      return records;
    }
    return records.filter((record) => record !== trailingStreamingRecord);
  }, [records, trailingStreamingRecord]);

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

      {items.length === 0 && !errorMsg ? (
        isWorking ? (
          <div className="conversation-empty" aria-hidden="true">
            <div className="conversation-empty-state">
              <WorkingPlaceholder label={workingLabel} statusText={workingStatusText} activity={workingActivity} className="mt-1" />
            </div>
          </div>
        ) : (
          <SkeletonConversation />
        )
      ) : null}

      <StaticHistoryList
        records={historyRecords}
        showReasoningTraces={showReasoningTraces}
        isWorking={isWorking}
        workingLabel={workingLabel}
        workingStatusText={workingStatusText}
        workingActivity={workingActivity}
        scrollParentRef={panelRef}
      />

      {trailingStreamingRecord ? (
        <StreamingTailContent
          record={trailingStreamingRecord}
          showReasoningTraces={showReasoningTraces}
          isWorking={isWorking}
          workingLabel={workingLabel}
          workingStatusText={workingStatusText}
          workingActivity={workingActivity}
        />
      ) : null}

      <div ref={bottomAnchorRef} aria-hidden="true" className="conversation-bottom-anchor" />

      <ScrollToBottomButton visible={showScrollButton} onClick={handleScrollToBottom} />
    </div>
  );
}

export default ConversationPanel;
