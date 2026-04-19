import { Brain, ChevronRight } from 'lucide-react';
import type { ThinkingItem } from '@/chatState';
import ToolRevealOnMount from './ToolRevealOnMount';

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

function cleanThinkingText(text: string): string {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return '';
  }

  return text
    .split('\n')
    .map((line) => line.replace(/^>\s?/, '').trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .trim();
}

function getThinkingSummary(text: string): string {
  if (!text) {
    return '';
  }

  const trimmed = text.trim();
  const newlineIndex = trimmed.indexOf('\n');
  const periodIndex = trimmed.indexOf('.');

  const cutoffCandidates = [
    newlineIndex >= 0 ? newlineIndex : Infinity,
    periodIndex >= 0 ? periodIndex : Infinity,
  ];
  const cutoff = Math.min(...cutoffCandidates);

  if (!Number.isFinite(cutoff)) {
    return trimmed;
  }

  return trimmed.substring(0, cutoff).trim();
}

interface ThinkingBlockProps {
  item: ThinkingItem;
}

export function ThinkingBlock({ item }: ThinkingBlockProps) {
  const content = cleanThinkingText(item.content);
  const summary = getThinkingSummary(content);

  return (
    <ToolRevealOnMount animate>
      <details className="message message-thinking">
        <summary className="message-thinking-summary">
          <span className="message-thinking-toggle" aria-hidden="true">
            <span className="message-thinking-toggle-icon message-thinking-toggle-icon-brain">
              <Brain size={14} />
            </span>
            <span className="message-thinking-toggle-icon message-thinking-toggle-icon-chevron">
              <ChevronRight size={14} />
            </span>
          </span>
          <span className="message-badge thinking">Thinking</span>
          {summary ? <span className="message-thinking-summary-text">{summary}</span> : null}
          <span className="message-time">{formatTimestamp(item.timestamp)}</span>
        </summary>
        <div className="message-thinking-body message-content-mono">{content || '…'}</div>
      </details>
    </ToolRevealOnMount>
  );
}

export default ThinkingBlock;
