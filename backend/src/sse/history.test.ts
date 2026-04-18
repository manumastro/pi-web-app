import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendSseHistorySync, getSseHistoryFilePath, loadSseHistoriesSync } from './history.js';

describe('sse history', () => {
  it('stores and reloads events from disk', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pi-web-sse-'));
    try {
      appendSseHistorySync(dir, {
        id: 1,
        event: {
          type: 'text_chunk',
          sessionId: 's1',
          messageId: 'm1',
          content: 'Hello',
          timestamp: '2026-04-15T10:00:00.000Z',
        },
      });
      appendSseHistorySync(dir, {
        id: 2,
        event: {
          type: 'done',
          sessionId: 's1',
          messageId: 'm1',
          aborted: false,
          timestamp: '2026-04-15T10:00:01.000Z',
        },
      });

      const histories = loadSseHistoriesSync(dir);
      expect(histories.get('s1')).toHaveLength(2);
      expect(histories.get('s1')?.[1]?.event.type).toBe('done');
      expect(getSseHistoryFilePath(dir, 's1')).toContain('.events.jsonl');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
