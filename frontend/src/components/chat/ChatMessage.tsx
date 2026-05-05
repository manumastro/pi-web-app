import type { ChatMessage } from './types';

interface ChatMessageProps {
  message: ChatMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  return <div className={`oc-msg ${message.role}`}>{message.text}</div>;
}
