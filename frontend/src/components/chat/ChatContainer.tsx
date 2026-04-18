import React from 'react';

interface ChatContainerProps {
  children: React.ReactNode;
}

export function ChatContainer({ children }: ChatContainerProps) {
  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      {children}
    </div>
  );
}

export default ChatContainer;
