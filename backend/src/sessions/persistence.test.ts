import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deleteSessionFile, getSessionFilePath, loadSessionsFromDir, parseSessionJsonl, sessionToJsonl, writeSessionFile } from './persistence.js';
import type { Session } from './store.js';

const baseSession: Session = {
  id: 'session_test-1',
  cwd: '/tmp/project',
  model: 'claude-3-5-sonnet-20241022',
  status: 'idle',
  messages: [
    { id: 'm1', role: 'user', content: 'hello', timestamp: '2026-04-15T10:00:00.000Z' },
    { id: 'm2', role: 'assistant', content: 'hi there', timestamp: '2026-04-15T10:00:01.000Z' },
  ],
  createdAt: '2026-04-15T10:00:00.000Z',
  updatedAt: '2026-04-15T10:00:01.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('persistence', () => {
  it('serializes and parses session JSONL', () => {
    const jsonl = sessionToJsonl(baseSession);
    const parsed = parseSessionJsonl(jsonl);

    expect(parsed).toEqual(baseSession);
  });

  it('returns undefined for invalid or empty input', () => {
    expect(parseSessionJsonl('')).toBeUndefined();
    expect(parseSessionJsonl('not-json')).toBeUndefined();
  });

  it('normalizes legacy in-progress statuses to the canonical busy state', () => {
    const legacy = parseSessionJsonl(JSON.stringify({
      type: 'session',
      id: baseSession.id,
      cwd: baseSession.cwd,
      model: baseSession.model,
      status: 'prompting',
      createdAt: baseSession.createdAt,
      updatedAt: baseSession.updatedAt,
    }));

    expect(legacy?.status).toBe('busy');
  });

  it('parses Pi RPC session files and preserves assistant errors', () => {
    const piSessionJsonl = [
      JSON.stringify({ type: 'session', version: 3, id: 'pi-session-1', timestamp: '2026-04-27T14:38:57.207Z', cwd: '/tmp/project' }),
      JSON.stringify({
        type: 'message',
        id: 'u1',
        parentId: null,
        timestamp: '2026-04-27T14:38:57.876Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'hi' }],
          timestamp: 1777300737864,
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: '2026-04-27T14:39:07.450Z',
        message: {
          role: 'assistant',
          content: [],
          stopReason: 'error',
          errorMessage: 'You have hit your ChatGPT usage limit (team plan). Try again in ~65 min.',
          timestamp: 1777300737888,
        },
      }),
    ].join('\n');

    const parsed = parseSessionJsonl(piSessionJsonl);

    expect(parsed?.status).toBe('error');
    expect(parsed?.messages).toHaveLength(2);
    expect(parsed?.messages[0]).toMatchObject({ role: 'user', content: 'hi' });
    expect(parsed?.messages[1]).toMatchObject({ role: 'assistant', errorMessage: 'You have hit your ChatGPT usage limit (team plan). Try again in ~65 min.', stopReason: 'error' });
  });

  it('builds a stable file path', () => {
    expect(getSessionFilePath('/sessions', 'session 1')).toBe(path.join('/sessions', 'session_1.jsonl'));
  });

  it('writes, reads, lists and deletes session files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pi-web-sessions-'));
    try {
      const filePath = await writeSessionFile(dir, baseSession);
      expect(await readFile(filePath, 'utf8')).toContain('"type":"session"');

      const sessions = await loadSessionsFromDir(dir);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual(baseSession);

      await deleteSessionFile(dir, baseSession.id);
      await expect(loadSessionsFromDir(dir)).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
