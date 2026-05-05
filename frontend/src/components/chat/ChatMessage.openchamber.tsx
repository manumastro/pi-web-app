import { MarkdownRenderer } from './MarkdownRenderer';
import type { ChatMessage as ChatMessageType } from './types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <div className={`oc-msg ${message.role}`} data-role={message.role}>
      <MarkdownRenderer content={message.text} />
    </div>
  );
}
