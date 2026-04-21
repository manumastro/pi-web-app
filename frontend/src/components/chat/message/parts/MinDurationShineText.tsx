import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';

interface MinDurationShineTextProps {
  text: string;
  minDuration?: number;
  className?: string;
  renderMarkdown?: boolean;
}

export const MinDurationShineText: React.FC<MinDurationShineTextProps> = ({
  text,
  minDuration = 300,
  className,
  renderMarkdown = false,
}) => {
  const [isShining, setIsShining] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const startTimeRef = React.useRef<number>(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    setShowContent(true);
    setIsShining(true);

    const elapsed = Date.now() - startTimeRef.current;
    const remaining = Math.max(0, minDuration - elapsed);

    const timer = setTimeout(() => {
      setIsShining(false);
    }, remaining + 200); // Add small buffer for animation

    return () => clearTimeout(timer);
  }, [minDuration, text]);

  return (
    <div
      className={cn(
        'relative',
        isShining && 'shine-text-container',
        className
      )}
    >
      <div className={cn(isShining && 'shine-text-content')}>
        {renderMarkdown ? (
          <SimpleMarkdownRenderer content={text} />
        ) : (
          text
        )}
      </div>
    </div>
  );
};

export default MinDurationShineText;