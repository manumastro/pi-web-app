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
  status: 'done',
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
