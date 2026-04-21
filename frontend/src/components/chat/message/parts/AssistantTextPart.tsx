import React from 'react';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';


type AssistantTextPartProps = {
  text: string;
  className?: string;
  isStreaming?: boolean;
};

function useStreamingTextThrottle(text: string, isStreaming: boolean, throttleMs = 70): string {
  const [throttledText, setThrottledText] = React.useState(text);
  const lastEmitRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!isStreaming) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setThrottledText(text);
      lastEmitRef.current = Date.now();
      return;
    }

    const now = Date.now();
    const elapsed = now - lastEmitRef.current;
    const delay = Math.max(0, throttleMs - elapsed);

    if (delay === 0) {
      setThrottledText(text);
      lastEmitRef.current = now;
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setThrottledText(text);
      lastEmitRef.current = Date.now();
      timerRef.current = null;
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isStreaming, text, throttleMs]);

  return throttledText;
}

export const AssistantTextPart: React.FC<AssistantTextPartProps> = ({
  text,
  className,
  isStreaming = false,
}) => {
  const throttledText = useStreamingTextThrottle(text, isStreaming, 100);

  if (!throttledText || throttledText.trim().length === 0) {
    return null;
  }

  // Keep streaming rendering lightweight for smoother chunk updates.
  // Markdown parsing is applied once the message is complete.
  if (isStreaming) {
    return (
      <div className={cn('message-content whitespace-pre-wrap break-words', className)}>
        {throttledText}
      </div>
    );
  }

  return (
    <div className={cn('message-content', className)}>
      <SimpleMarkdownRenderer content={throttledText} />
    </div>
  );
};

export default AssistantTextPart;