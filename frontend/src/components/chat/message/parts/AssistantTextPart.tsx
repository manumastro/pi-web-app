import React from 'react';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { useStreamingTextThrottle } from '../../hooks/useStreamingTextThrottle';
import { useContentSettled } from '../../hooks/useContentSettled';

type AssistantTextPartProps = {
  text: string;
  className?: string;
  isStreaming?: boolean;
};

export const AssistantTextPart: React.FC<AssistantTextPartProps> = ({
  text,
  className,
  isStreaming = false,
}) => {
  const throttledText = useStreamingTextThrottle({
    text,
    isStreaming,
    identityKey: 'assistant-text',
  });

  const isSettled = useContentSettled(throttledText, isStreaming ? 160 : 60);

  if (!throttledText || throttledText.trim().length === 0) {
    return null;
  }

  return (
    <div className={cn('message-content', isStreaming && 'streaming', !isSettled && 'content-settling', isSettled && 'content-settled', className)}>
      <SimpleMarkdownRenderer content={throttledText} variant="assistant" />
    </div>
  );
};

export default AssistantTextPart;