import { describe, expect, it } from 'vitest';
import type { ServerResponse } from 'node:http';
import { createSseManager } from './manager.js';

function createResponseRecorder() {
  const chunks: string[] = [];
  const response = {
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  } as unknown as ServerResponse;

  return { chunks, response };
}

describe('sse manager', () => {
  it('broadcasts events with ids', () => {
    const manager = createSseManager();
    const { chunks, response } = createResponseRecorder();
    manager.subscribe('s1', response);

    manager.broadcast({
      type: 'done',
      sessionId: 's1',
      messageId: 'm1',
      aborted: false,
      timestamp: '2026-04-15T10:00:00.000Z',
    });

    expect(chunks.join('')).toContain('id: 1');
    expect(chunks.join('')).toContain('event: done');
  });

  it('replays missed events when last-event-id is provided', () => {
    const manager = createSseManager();
    const first = createResponseRecorder();
    manager.subscribe('s1', first.response);

    manager.broadcast({
      type: 'text_chunk',
      sessionId: 's1',
      messageId: 'm1',
      content: 'Hello',
      timestamp: '2026-04-15T10:00:00.000Z',
    });
    manager.broadcast({
      type: 'done',
      sessionId: 's1',
      messageId: 'm1',
      aborted: false,
      timestamp: '2026-04-15T10:00:01.000Z',
    });

    const replay = createResponseRecorder();
    manager.subscribe('s1', replay.response, '1');

    expect(replay.chunks.join('')).toContain('event: done');
    expect(replay.chunks.join('')).not.toContain('event: text_chunk\n');
  });
});
