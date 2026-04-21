import React from 'react';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { MinDurationShineText } from './MinDurationShineText';
import { useIsStreaming } from '@/sync/viewport-store';

type AssistantTextPartProps = {
  text: string;
  animateTailText?: boolean;
  minShineDuration?: number;
  className?: string;
};

export const AssistantTextPart: React.FC<AssistantTextPartProps> = ({
  text,
  animateTailText = false,
  minShineDuration = 300,
  className,
}) => {
  // Use streaming state from viewport store to know if we're in streaming mode
  const isStreaming = useIsStreaming();

  if (!text || text.trim().length === 0) {
    return null;
  }

  // During streaming, render markdown-like content with proper formatting
  // This ensures the text is displayed with similar spacing/structure as completed markdown
  if (isStreaming) {
    return (
      <MinDurationShineText
        text={text}
        minDuration={minShineDuration}
        className={cn('message-content', className)}
        renderMarkdown
      />
    );
  }

  return (
    <div className={cn('message-content', className)}>
      <SimpleMarkdownRenderer content={text} />
    </div>
  );
};

export default AssistantTextPart;