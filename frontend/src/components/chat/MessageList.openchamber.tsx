import ChatEmptyState from './ChatEmptyState';
import { ChatMessage } from './ChatMessage.openchamber';
import type { ChatMessage as ChatMessageType } from './types';

interface MessageListProps {
  messages: ChatMessageType[];
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) return <ChatEmptyState />;
  return (
    <>
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}
    </>
  );
}
