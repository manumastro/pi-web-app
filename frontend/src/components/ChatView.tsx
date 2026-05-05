/**
 * ChatView — the main chat view component.
 * Connects useSession + useSSE + MessageList + MessageInput.
 */

import React from 'react';
import { useSession } from '../hooks/useSession';
import { useSSE } from '../hooks/useSSE';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export const ChatView: React.FC = () => {
  const {
    session,
    messages,
    loading,
    sending,
    error,
    sendMessage,
    handleDelta,
    handleStatus,
    sessionId,
  } = useSession('/home/manu/pi-web-app');

  // Connect SSE for streaming updates
  useSSE({
    sessionId,
    onMessageDelta: handleDelta,
    onSessionStatus: handleStatus,
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Caricamento sessione...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">
          {session?.title ?? 'Pi Web Chat'}
        </h1>
        <span className="text-xs text-gray-400">
          {session ? `Session: ${session.id.slice(0, 8)}...` : ''}
        </span>
      </header>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          Errore: {error}
        </div>
      )}

      {/* Messages */}
      <MessageList messages={messages} sending={sending} />

      {/* Input */}
      <MessageInput onSend={sendMessage} disabled={sending} />
    </div>
  );
};
