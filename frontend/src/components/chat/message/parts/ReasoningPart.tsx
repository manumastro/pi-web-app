import React, { useState, useMemo } from 'react';
import { Brain, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolRevealOnMount } from '../../ToolRevealOnMount';
import { formatDuration } from '../timeFormat';

type ReasoningVariant = 'thinking' | 'justification';

interface ReasoningPartProps {
  text: string;
  variant?: ReasoningVariant;
  blockId: string;
  done?: boolean;
  time?: { start?: number; end?: number };
  isStreaming?: boolean;
  className?: string;
}

const cleanReasoningText = (text: string): string => {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return '';
  }

  return text
    .split('\n')
    .map((line: string) => line.replace(/^>\s?/, '').trimEnd())
    .filter((line: string) => line.trim().length > 0)
    .join('\n')
    .trim();
};

const getReasoningSummary = (text: string): string => {
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
};

export const ReasoningPart: React.FC<ReasoningPartProps> = ({
  text,
  variant = 'thinking',
  blockId,
  done = false,
  time,
  isStreaming = false,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const cleanedText = useMemo(() => cleanReasoningText(text), [text]);
  const summary = useMemo(() => getReasoningSummary(cleanedText), [cleanedText]);

  const isEmpty = !cleanedText || cleanedText.length === 0;
  if (isEmpty) {
    return null;
  }

  const label = variant === 'thinking' ? 'Thinking' : 'Justification';
  const Icon = Brain;
  const showStreamingDot = isStreaming || !done;

  const timeStart = typeof time?.start === 'number' ? time.start : undefined;
  const timeEnd = typeof time?.end === 'number' ? time.end : undefined;

  return (
    <ToolRevealOnMount animate>
      <details
        className={cn('reasoning-block', className)}
        open={isExpanded}
        data-reasoning-block-id={blockId}
      >
        <summary
          className="reasoning-summary"
          onClick={(e) => {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }}
        >
          <span className="reasoning-toggle">
            {isExpanded ? (
              <ChevronDown size={14} className="toggle-icon-chevron" />
            ) : (
              <ChevronRight size={14} className="toggle-icon-chevron" />
            )}
            <Icon size={14} className="toggle-icon-brain" />
          </span>
          <span className={cn('reasoning-badge', variant === 'thinking' && 'thinking')}>
            {label}
          </span>
          {summary && !isExpanded && (
            <span className="reasoning-summary-text">{summary}</span>
          )}
          {timeStart !== undefined && (
            <span className="reasoning-duration">
              {formatDuration(timeStart, timeEnd)}
            </span>
          )}
          {showStreamingDot && <span className="reasoning-streaming-dot" />}
        </summary>
        <div className="reasoning-body">
          <pre className="reasoning-content">{cleanedText}</pre>
        </div>
      </details>
    </ToolRevealOnMount>
  );
};

export default ReasoningPart;
