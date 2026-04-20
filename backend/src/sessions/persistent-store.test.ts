import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPersistentSessionStore } from './persistent-store.js';
import { writeSessionFileSync } from './persistence.js';
import type { Session } from './store.js';

const session: Session = {
  id: 'session-persist-1',
  cwd: '/tmp/project',
  model: 'claude-3-5-sonnet-20241022',
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
});
