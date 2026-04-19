import React from 'react';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { MinDurationShineText } from './MinDurationShineText';

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
  if (!text || text.trim().length === 0) {
    return null;
  }

  if (animateTailText) {
    return (
      <MinDurationShineText
        text={text}
        minDuration={minShineDuration}
        className={cn('message-content', className)}
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
