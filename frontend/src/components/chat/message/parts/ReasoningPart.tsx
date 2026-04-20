import React from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';

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
    .map((line) => line.replace(/^>\s?/, '').trimEnd())
    .filter((line) => line.trim().length > 0)
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

const formatDuration = (start: number, end?: number, now: number = Date.now()): string => {
  const duration = typeof end === 'number' ? end - start : now - start;
  const seconds = duration / 1000;
  const displaySeconds = seconds < 0.05 && typeof end === 'number' ? 0.1 : seconds;
  return `${displaySeconds.toFixed(1)}s`;
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
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);

  const cleanedText = React.useMemo(() => cleanReasoningText(text), [text]);
  const summary = React.useMemo(() => getReasoningSummary(cleanedText), [cleanedText]);
  const timeStart = typeof time?.start === 'number' && Number.isFinite(time.start) ? time.start : undefined;
  const timeEnd = typeof time?.end === 'number' && Number.isFinite(time.end) ? time.end : undefined;
  const isEmpty = !cleanedText || cleanedText.length === 0;

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (isEmpty) {
    return null;
  }

  const label = variant === 'thinking' ? 'Thinking' : 'Justification';

  return (
    <div
      className={cn('reasoning-timeline-block', isMounted && 'is-mounted', className)}
      data-reasoning-block-id={blockId}
      data-expanded={isExpanded}
    >
      <button
        type="button"
        className="reasoning-summary-row"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <span className="reasoning-toggle-icon" aria-hidden="true">
          {isExpanded ? <ChevronDown size={14} className="toggle-icon-chevron" /> : <ChevronRight size={14} className="toggle-icon-chevron" />}
          <Brain size={14} className="toggle-icon-brain" />
        </span>
        <span className={cn('reasoning-badge', variant === 'thinking' && 'thinking')}>
          {label}
        </span>
        {summary && !isExpanded ? (
          <span className="reasoning-summary-text">{summary}</span>
        ) : null}
        {typeof timeStart === 'number' ? (
          <span className="reasoning-duration">{formatDuration(timeStart, timeEnd)}</span>
        ) : null}
      </button>

      <div className="reasoning-expanded-body" aria-hidden={!isExpanded}>
        <SimpleMarkdownRenderer content={cleanedText} className="reasoning-content-markdown" />
      </div>
    </div>
  );
};

export default ReasoningPart;
