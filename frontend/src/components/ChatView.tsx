/**
 * ChatView — the main chat view component.
 * Connects useSession + useSSE + MessageList + MessageInput.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sendPrompt, connectSSE, type MessageRecord, type SseEvent } from '../lib/api';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export const ChatView: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState('Pi Web Chat');

  // Ref to track current messages length for polling
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Create session on mount
  useEffect(() => {
    fetch('http://localhost:3211/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: '/home/manu/pi-web-app', title: '' }),
    })
      .then((r) => r.json())
      .then((s) => {
        setSessionId(s.id);
        return fetch(`http://localhost:3211/api/session/${encodeURIComponent(s.id)}/message`);
      })
      .then((r) => r.json())
      .then((msgs) => setMessages(msgs))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // SSE connection for streaming
  useEffect(() => {
    if (!sessionId) return;

    const { close } = connectSSE(
      (event: SseEvent) => {
        const props = event.properties ?? {};
        const propsAny = props as Record<string, unknown>;
        const eventSessionId =
          (propsAny.sessionID as string | undefined) ??
          (propsAny.info as Record<string, unknown> | undefined)?.sessionID as string | undefined ??
          (propsAny.part as Record<string, unknown> | undefined)?.sessionID as string | undefined;

        if (eventSessionId !== sessionId) return;

        // message.part.delta → streaming text
        if (event.type === 'message.part.delta') {
          const messageID = props.messageID as string | undefined;
          const partID = props.partID as string | undefined;
          const delta = props.delta as string | undefined;
          if (messageID && partID && delta) {
            setMessages((prev) => {
              const updated = [...prev];
              const msgIdx = updated.findIndex((m) => m.info?.id === messageID);
              if (msgIdx === -1) return prev;
              const msg = { ...updated[msgIdx] };
              const parts = [...(msg.parts ?? [])];
              const partIdx = parts.findIndex((p: { id: string }) => p.id === partID);
              if (partIdx === -1) return prev;
              const part = { ...parts[partIdx] };
              part.text = (part.text ?? '') + delta;
              parts[partIdx] = part;
              msg.parts = parts;
              updated[msgIdx] = msg;
              return updated;
            });
          }
        }

        // session.status → check if done
        if (event.type === 'session.status' || event.type === 'session.idle') {
          const status = (props.status as Record<string, unknown> | undefined)?.type as string | undefined;
          if (status === 'idle') {
            // Re-fetch messages to get final state
            fetch(`http://localhost:3211/api/session/${encodeURIComponent(sessionId)}/message`)
              .then((r) => r.json())
              .then((msgs) => setMessages(msgs))
              .catch(() => {});
            setSending(false);
          }
        }
      },
      (err) => console.warn('[SSE] error', err),
    );

    return () => close();
  }, [sessionId]);

  const handleSend = useCallback(async (text: string) => {
    if (!sessionId || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendPrompt(sessionId, text, {
        thinkingLevel: 'minimal',
        baseUrl: 'http://localhost:3211',
        model: { providerID: 'opencode-go', modelID: 'deepseek-v4-flash' },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  }, [sessionId, sending]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Caricamento sessione...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{sessionTitle}</h1>
        <span className="text-xs text-gray-400">
          {sessionId ? `Session: ${sessionId.slice(0, 8)}...` : ''}
        </span>
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
