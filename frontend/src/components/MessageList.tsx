/**
 * MessageList — stile openchamber, logica semplificata.
 */

import React, { useRef, useEffect } from 'react';
import type { MessageRecord } from '../lib/api';

interface MessageListProps {
  messages: MessageRecord[];
  sending: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, sending }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p>Nessun messaggio. Scrivi qualcosa per iniziare!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 chat-scroll">
      {messages.map((msg) => {
        const role = msg.info?.role ?? 'unknown';
        const isUser = role === 'user';
        const textParts = (msg.parts ?? []).filter((p: { type: string }) => p.type === 'text');
        const content = textParts.map((p: { text?: string }) => p.text ?? '').join('');

        return (
          <div
            key={msg.info?.id ?? Math.random()}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                isUser
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
              <div className="text-xs opacity-60 mb-1">
                {isUser ? 'Tu' : 'AI'}
              </div>
              <div className="whitespace-pre-wrap break-words">{content || '...'}</div>
            </div>
          </div>
        );
      })}

      {sending && (
        <div className="flex justify-start">
          <div className="bg-gray-100 rounded-lg px-4 py-2 text-gray-400 text-sm">
            ↻ Sta scrivendo...
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
