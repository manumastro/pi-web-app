import React from 'react';
import { ChatErrorBoundary } from '@/components/chat/ChatErrorBoundary';
import { ChatContainer } from '@/components/chat/ChatContainer';

interface ChatViewProps {
  sessionId?: string | null;
  children: React.ReactNode;
}

export function ChatView({ sessionId, children }: ChatViewProps) {
  return (
    <ChatErrorBoundary>
      <ChatContainer>
        {children}
      </ChatContainer>
    </ChatErrorBoundary>
  );
}

export default ChatView;
