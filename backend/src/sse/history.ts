import fs from 'node:fs';
import path from 'node:path';
import type { SseEvent } from '../sdk/events.js';

export interface StoredSseEvent {
  id: number;
  event: SseEvent;
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isStoredSseEvent(value: unknown): value is StoredSseEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredSseEvent> & { event?: Partial<SseEvent> };
  return typeof candidate.id === 'number'
    && !!candidate.event
    && typeof candidate.event === 'object'
    && typeof candidate.event.sessionId === 'string'
    && typeof candidate.event.type === 'string';
}

export function getSseHistoryFilePath(historyDir: string, sessionId: string): string {
  return path.join(historyDir, `${sanitizeSessionId(sessionId)}.events.jsonl`);
}

export function appendSseHistorySync(historyDir: string, event: StoredSseEvent): void {
  fs.mkdirSync(historyDir, { recursive: true });
  const filePath = getSseHistoryFilePath(historyDir, event.event.sessionId);
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf8');
}

export function loadSseHistoriesSync(historyDir: string): Map<string, StoredSseEvent[]> {
  const histories = new Map<string, StoredSseEvent[]>();

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(historyDir, { withFileTypes: true });
  } catch {
    return histories;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.events.jsonl')) {
      continue;
    }

    const filePath = path.join(historyDir, entry.name);
    let raw = '';
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!isStoredSseEvent(parsed)) {
          continue;
        }

        const sessionHistory = histories.get(parsed.event.sessionId) ?? [];
        sessionHistory.push(parsed);
        histories.set(parsed.event.sessionId, sessionHistory);
      } catch {
        continue;
      }
    }
  }

  for (const [sessionId, events] of histories.entries()) {
    events.sort((a, b) => a.id - b.id);
    histories.set(sessionId, events);
  }

  return histories;
}
