import type { ChatMessage } from './types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatMessageProps {
  message: ChatMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <div className={`oc-msg ${message.role}`} data-role={message.role}>
      <MarkdownRenderer content={message.text} />
    </div>
  );
}
