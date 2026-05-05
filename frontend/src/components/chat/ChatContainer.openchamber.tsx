import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { OpenCodeLogo } from '../ui/OpenCodeLogo';
import { MessageList } from './MessageList.openchamber';
import { ChatInput } from './ChatInput.openchamber';
import type { ChatMessage } from './types';

export function ChatContainer() {
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamSessionIdRef = useRef<string>('');

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const s = await r.json();
      setSessionId(s.id);
    })();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    streamSessionIdRef.current = sessionId;
    const es = new EventSource('/api/global/event');

    const eventSessionId = (payload: any): string | undefined => (
      payload?.properties?.sessionID
      ?? payload?.properties?.part?.sessionID
      ?? payload?.properties?.info?.sessionID
    );

    const upsertAssistant = (id: string, content: string, append = false) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], text: append ? `${next[idx].text}${content}` : content };
          return next;
        }
        return [...prev, { id, role: 'assistant', text: content }];
      });
    };

    es.onmessage = (event) => {
      const payload = JSON.parse(event.data) as any;
      const sid = eventSessionId(payload);
      if (sid && sid !== streamSessionIdRef.current) return;

      if (payload.type === 'message.part.updated' && payload.properties?.part?.type === 'text') {
        const part = payload.properties.part;
        const messageID = part.messageID || part.messageId;
        if (messageID && typeof part.text === 'string') upsertAssistant(messageID, part.text, false);
      }

      if (payload.type === 'message.part.delta' && typeof payload.properties?.delta === 'string' && typeof payload.properties?.messageID === 'string') {
        const partId: string = payload.properties?.partID || '';
        if (partId.endsWith('-text')) upsertAssistant(payload.properties.messageID, payload.properties.delta, true);
      }

      if (payload.type === 'session.idle' && sid === streamSessionIdRef.current) setLoading(false);
    };

    return () => es.close();
  }, [sessionId]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const canSend = useMemo(() => sessionId && text.trim().length > 0 && !loading, [sessionId, text, loading]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    const prompt = text.trim();
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: prompt }]);
    setText('');
    setLoading(true);

    await fetch(`/api/session/${sessionId}/prompt_async`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parts: [{ type: 'text', text: prompt }], messageID: `ui-msg-${Date.now()}` }),
    });
  };

  return (
    <div className="oc-root">
      <header className="oc-header"><OpenCodeLogo className="oc-logo" /></header>
      <main className="oc-chat">
        <MessageList messages={messages} />
        <div ref={bottomRef} />
      </main>
      <ChatInput text={text} loading={loading} canSend={Boolean(canSend)} onChange={setText} onSubmit={onSubmit} />
    </div>
  );
}
