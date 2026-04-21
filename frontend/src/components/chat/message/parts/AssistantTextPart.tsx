import React from 'react';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { useStreamingTextThrottle } from '../../hooks/useStreamingTextThrottle';

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

  if (!throttledText || throttledText.trim().length === 0) {
    return null;
  }

  return (
    <div className={cn('message-content', isStreaming && 'streaming', className)}>
      <SimpleMarkdownRenderer content={throttledText} />
    </div>
  );
};

export default AssistantTextPart;