export interface ForensicEvent {
  type: string;
  sessionId?: string;
  timestamp?: string;
  [key: string]: unknown;
}

const ENDPOINT = '/api/forensics/client';

export function emitForensicEvent(event: ForensicEvent): void {
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), ...event });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
  } catch {
    // fallback below
  }

  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}
