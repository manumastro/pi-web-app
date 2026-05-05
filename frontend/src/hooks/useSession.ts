/**
 * useSession — hook per gestire una sessione di chat.
 * Crea la sessione se non esiste, invia prompt, gestisce stato + messaggi.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createSession,
  getSession,
  getMessages,
  sendPrompt,
  listModels,
  type Session,
  type MessageRecord,
  type ModelInfo,
} from '../lib/api';

export function useSession(initialDirectory?: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: string }>({ type: 'idle' });
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // Carica modelli all'avvio
  useEffect(() => {
    listModels()
      .then(setModels)
      .catch((e) => console.warn('listModels failed', e));
  }, []);

  // Crea o carica sessione
  useEffect(() => {
    const dir = initialDirectory ?? (typeof window !== 'undefined' ? window.location.pathname : '/home/manu');
    createSession(dir, '')
      .then((s) => {
        setSession(s);
        return getMessages(s.id);
      })
      .then((msgs) => setMessages(msgs))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invia prompt
  const sendMessage = useCallback(async (text: string) => {
    const s = sessionRef.current;
    if (!s || sending) return;
    setSending(true);
    setError(null);

    try {
      await sendPrompt(s.id, text, { thinkingLevel: 'minimal' });

      // Poll for new messages + status
      const deadline = Date.now() + 180_000;
      const poll = async (): Promise<void> => {
        if (Date.now() > deadline) throw new Error('timeout');
        const [msgs, sess] = await Promise.all([
          getMessages(s.id),
          getSession(s.id),
        ]);
        setMessages(msgs);
        setSession(sess);
        const isIdle = !sess.statusMessage || sess.statusMessage === 'Context usage updated' || sess.statusMessage === 'Done';
        const hasNew = msgs.length > messages.length;
        if (isIdle && hasNew) return;
        await new Promise((r) => setTimeout(r, 500));
        return poll();
      };
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }, [sending, messages.length]);

  // Callback per SSE streaming
  const handleDelta = useCallback((messageID: string, partID: string, delta: string) => {
    setMessages((prev) => {
      const updated = [...prev];
      const msgIdx = updated.findIndex((m) => m.info.id === messageID);
      if (msgIdx === -1) return prev;

      const msg = { ...updated[msgIdx] };
      const partIdx = (msg.parts ?? []).findIndex((p: { id: string }) => p.id === partID);
      if (partIdx === -1) return prev;

      const part = { ...msg.parts[partIdx] };
      part.text = (part.text ?? '') + delta;
      msg.parts = [...msg.parts];
      msg.parts[partIdx] = part;
      updated[msgIdx] = msg;
      return updated;
    });
  }, []);

  const handleStatus = useCallback((s: { type: string }) => {
    setStatus(s);
  }, []);

  return {
    session,
    messages,
    loading,
    sending,
    status,
    models,
    error,
    sendMessage,
    handleDelta,
    handleStatus,
    sessionId: session?.id ?? null,
  };
}
