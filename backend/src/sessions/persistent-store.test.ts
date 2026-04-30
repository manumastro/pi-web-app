import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPersistentSessionStore } from './persistent-store.js';
import { writeSessionFileSync, sessionToJsonl } from './persistence.js';
import type { Session } from './store.js';

const session: Session = {
  id: 'session-persist-1',
  cwd: '/tmp/project',
  model: 'claude-3-5-sonnet-20241022',
  thinkingLevel: 'medium',
  piSessionId: 'pi-session-persist-1',
  piSessionFile: '/tmp/pi-session-persist-1.jsonl',
  status: 'busy',
  messages: [
    { id: 'm1', role: 'user', content: 'hello', timestamp: '2026-04-15T10:00:00.000Z' },
  ],
  createdAt: '2026-04-15T10:00:00.000Z',
  updatedAt: '2026-04-15T10:00:00.000Z',
};

describe('persistent session store', () => {
  it('hydrates sessions from disk', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pi-web-persist-'));
    try {
      writeSessionFileSync(dir, session);
      const store = createPersistentSessionStore(dir);
      store.hydrateSync();

      expect(store.getSession(session.id)).toEqual(session);
      expect(store.listSessions()).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('persists newly created sessions', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pi-web-persist-'));
    try {
      const store = createPersistentSessionStore(dir);
      const created = store.createSession('/tmp/project', 'gpt-4', 'session-persist-2');

      expect(created.id).toBe('session-persist-2');
      expect(store.getSession(created.id)).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('caches pi snapshot refreshes between repeated list requests', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pi-web-persist-'));
    const piSessionFile = path.join(dir, 'pi-session.jsonl');
    const snapshot: Session = {
      ...session,
      piSessionFile,
      title: 'Snapshot',
      updatedAt: '2026-04-15T10:05:00.000Z',
    };

    try {
      await writeFile(piSessionFile, sessionToJsonl(snapshot), 'utf8');
      writeSessionFileSync(dir, session);
      const store = createPersistentSessionStore(dir);
      store.hydrateSync();

      const readSpy = vi.spyOn(fs, 'readFileSync');
      store.listSessions();
      store.listSessions();

      const snapshotReads = readSpy.mock.calls.filter(([filePath]) => filePath === piSessionFile);
      expect(snapshotReads).toHaveLength(0);
      readSpy.mockRestore();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
