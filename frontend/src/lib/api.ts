/**
 * Minimal API client for Pi Web backend.
 * Uses fetch + EventSource (SSE).
 * Compatible with OpenChamber SDK event format.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3211'; // Direct call, no proxy

// ── Types ──────────────────────────────────────────────────

export interface Session {
  id: string;
  slug: string;
  title: string;
  directory: string;
  model: string;
  thinkingLevel: string;
  statusMessage: string;
  time: { created: number; updated: number };
}

export interface MessagePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'text' | 'reasoning';
  text?: string;
}

export interface MessageRecord {
  info: {
    id: string;
    sessionID: string;
    role: 'user' | 'assistant';
    time: { created: number };
    model?: { providerID: string; modelID: string };
  };
  parts: MessagePart[];
}

export interface ModelInfo {
  id: string;
  providerID: string;
  modelID: string;
  name: string;
  available: boolean;
}

// ── API calls ─────────────────────────────────────────────

export async function createSession(directory: string, title?: string): Promise<Session> {
  const res = await fetch(`${BASE_URL}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory, title: title ?? '' }),
  });
  if (!res.ok) throw new Error(`createSession: ${res.status}`);
  return res.json();
}

export async function getSession(sessionId: string): Promise<Session> {
  const res = await fetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`getSession: ${res.status}`);
  return res.json();
}

export async function listSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE_URL}/api/session`);
  if (!res.ok) throw new Error(`listSessions: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getMessages(sessionId: string): Promise<MessageRecord[]> {
  const res = await fetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}/message`);
  if (!res.ok) throw new Error(`getMessages: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.messages ?? []);
}

export async function sendPrompt(
  sessionId: string,
  text: string,
  options?: {
    messageID?: string;
    thinkingLevel?: string;
    model?: { providerID: string; modelID: string };
  },
): Promise<void> {
  const messageID = options?.messageID ?? `msg-${Date.now()}`;
  const body: Record<string, unknown> = {
    parts: [{ type: 'text', text }],
    messageID,
    thinkingLevel: options?.thinkingLevel ?? 'minimal',
  };
  if (options?.model) body.model = options.model;

  const res = await fetch(
    `${BASE_URL}/api/session/${encodeURIComponent(sessionId)}/prompt_async`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`sendPrompt: ${res.status}`);
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE_URL}/api/models`);
  if (!res.ok) throw new Error(`listModels: ${res.status}`);
  const data = await res.json();
  return data.models ?? [];
}

// ── SSE (global event stream) ──────────────────────────────

export type SseEventType =
  | 'server.connected'
  | 'session.status'
  | 'session.updated'
  | 'message.updated'
  | 'message.part.updated'
  | 'message.part.delta'
  | 'session.idle'
  | 'openchamber:heartbeat'
  | string;

export interface SseEvent {
  type: SseEventType;
  properties: Record<string, unknown>;
}

export function connectSSE(
  onEvent: (event: SseEvent) => void,
  onError?: (err: Event) => void,
): { close: () => void } {
  const url = `${BASE_URL}/api/global/event`;
  const evtSource = new EventSource(url);

  evtSource.onmessage = (ev) => {
    try {
      const event: SseEvent = JSON.parse(ev.data);
      onEvent(event);
    } catch {
      // ignore malformed
    }
  };

  evtSource.onerror = (err) => {
    if (evtSource.readyState === EventSource.CLOSED) return;
    onError?.(err);
  };

  return {
    close: () => evtSource.close(),
  };
}
