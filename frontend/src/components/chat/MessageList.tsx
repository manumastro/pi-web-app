import type { ChatMessage as ChatMessageType } from './types';
import { ChatMessage } from './ChatMessage';
import ChatEmptyState from './ChatEmptyState';

interface MessageListProps {
  messages: ChatMessageType[];
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) return <ChatEmptyState />;
  return (
    <>
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} />
      ))}
    </>
  );
}
