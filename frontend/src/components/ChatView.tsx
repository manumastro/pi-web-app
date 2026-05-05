/**
 * ChatView — simplified version without SSE.
 */

import React, { useState, useEffect } from 'react';
import { createSession, getMessages, sendPrompt, type MessageRecord } from '../lib/api';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export const ChatView: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create session on mount
  useEffect(() => {
    createSession('/home/manu/pi-web-app', '')
      .then((s) => {
        setSessionId(s.id);
        return getMessages(s.id);
      })
      .then((msgs) => setMessages(msgs))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSend = async (text: string) => {
    if (!sessionId || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendPrompt(sessionId, text, { thinkingLevel: 'minimal' });
      // Poll for response: check if we have new messages
      const deadline = Date.now() + 180_000;
      let lastCount = messages.length;
      const poll = async (): Promise<void> => {
        if (Date.now() > deadline) throw new Error('timeout');
        const msgs = await getMessages(sessionId);
        const newCount = msgs.length;
        setMessages(msgs);
        // Check if we have assistant reply (last message is assistant)
        const lastMsg = msgs[msgs.length - 1];
        const hasReply = lastMsg && lastMsg.info?.role === 'assistant';
        if (hasReply && newCount > lastCount) return;
        lastCount = newCount;
        await new Promise((r) => setTimeout(r, 500));
        return poll();
      };
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Caricamento sessione...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Pi Web Chat</h1>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          Errore: {error}
        </div>
      )}

      <MessageList messages={messages} sending={sending} />
      <MessageInput onSend={handleSend} disabled={sending} />
    </div>
  );
};
