import React from 'react';
import { ChatContainer } from '../chat/ChatContainer';
import { ChatErrorBoundary } from '../chat/ChatErrorBoundary';

export const ChatView: React.FC = () => {
  return (
    <ChatErrorBoundary>
      <ChatContainer />
    </ChatErrorBoundary>
  );
};
