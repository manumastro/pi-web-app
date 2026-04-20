import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSessionStore, type SessionStore, type Session } from './store.js';

// Mock uuid for deterministic testing
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

describe('session store', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = createSessionStore();
  });

  describe('createSession', () => {
    it('should create a new session with default values', () => {
      const session = store.createSession('/home/user/project');

      expect(session.cwd).toBe('/home/user/project');
      expect(session.status).toBe('idle');
      expect(session.messages).toHaveLength(0);
      expect(session.createdAt).toBeTruthy();
      expect(session.updatedAt).toBeTruthy();
      expect(session.id).toBeTruthy();
    });

    it('should create session with custom model', () => {
      const session = store.createSession('/home/user', 'gpt-4');

      expect(session.model).toBe('gpt-4');
    });

    it('should generate unique session IDs', () => {
      const session1 = store.createSession('/home/user');
      const session2 = store.createSession('/home/user');

      expect(session1.id).not.toBe(session2.id);
    });

    it('should store session in memory', () => {
      const session = store.createSession('/home/user');

      expect(store.getSession(session.id)).toBeDefined();
      expect(store.getSession(session.id)?.id).toBe(session.id);
    });

    it('should use provided session ID', () => {
      const session = store.createSession('/home/user', undefined, 'custom-id');

      expect(session.id).toBe('custom-id');
    });
  });

  describe('getSession', () => {
    it('should return undefined for non-existent session', () => {
      expect(store.getSession('non-existent')).toBeUndefined();
    });

    it('should return session by ID', () => {
      const created = store.createSession('/home/user');
      const retrieved = store.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.cwd).toBe(created.cwd);
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions exist', () => {
      expect(store.listSessions()).toEqual([]);
    });

    it('should return all sessions', () => {
      store.createSession('/home/user1');
      store.createSession('/home/user2');
      store.createSession('/home/user3');

      const sessions = store.listSessions();

      expect(sessions).toHaveLength(3);
    });

    it('should filter sessions by cwd', () => {
      store.createSession('/home/project1');
      store.createSession('/home/project1');
      store.createSession('/home/project2');

      const project1Sessions = store.listSessions('/home/project1');

      expect(project1Sessions).toHaveLength(2);
      expect(project1Sessions.every((s) => s.cwd === '/home/project1')).toBe(true);
    });
  });

  describe('updateSession', () => {
    it('should update session fields', () => {
      const session = store.createSession('/home/user');
      const updated = store.updateSession(session.id, { status: 'busy', title: 'Renamed session' });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('busy');
      expect(updated?.title).toBe('Renamed session');
    });

    it('should update updatedAt timestamp', async () => {
      const session = store.createSession('/home/user');
      const originalUpdatedAt = session.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      store.updateSession(session.id, { status: 'busy' });
      const updated = store.getSession(session.id);

      expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should return undefined for non-existent session', () => {
      expect(store.updateSession('non-existent', { status: 'busy' })).toBeUndefined();
    });
  });

  describe('deleteSession', () => {
    it('should remove session from store', () => {
      const session = store.createSession('/home/user');
      const deleted = store.deleteSession(session.id);

      expect(deleted).toBe(true);
      expect(store.getSession(session.id)).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      expect(store.deleteSession('non-existent')).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('should append message to session', () => {
      const session = store.createSession('/home/user');
      const message = { role: 'user' as const, content: 'Hello' };

      const updated = store.addMessage(session.id, message);

      expect(updated?.messages).toHaveLength(1);
      expect(updated?.messages[0].content).toBe('Hello');
    });

    it('should preserve existing messages', () => {
      const session = store.createSession('/home/user');
      store.addMessage(session.id, { role: 'user' as const, content: 'Hello' });
      store.addMessage(session.id, { role: 'assistant' as const, content: 'Hi!' });

      const updated = store.getSession(session.id);

      expect(updated?.messages).toHaveLength(2);
    });

    it('should return undefined for non-existent session', () => {
      expect(store.addMessage('non-existent', { role: 'user' as const, content: 'Hi' })).toBeUndefined();
    });
  });

  describe('session status transitions', () => {
    it('should start with idle status', () => {
      const session = store.createSession('/home/user');

      expect(session.status).toBe('idle');
    });

    it('should update to busy status', () => {
      const session = store.createSession('/home/user');
      const updated = store.updateSession(session.id, { status: 'busy' });

      expect(updated?.status).toBe('busy');
    });

    it('should normalize legacy prompting status to busy', () => {
      const session = store.createSession('/home/user');
      const updated = store.updateSession(session.id, { status: 'prompting' });

      expect(updated?.status).toBe('busy');
    });

    it('should normalize retry status', () => {
      const session = store.createSession('/home/user');
      const updated = store.updateSession(session.id, { status: 'retry' });

      expect(updated?.status).toBe('retry');
    });

    it('should normalize done status to idle', () => {
      const session = store.createSession('/home/user');
      const updated = store.updateSession(session.id, { status: 'done' });

      expect(updated?.status).toBe('idle');
    });

    it('should update to error status', () => {
      const session = store.createSession('/home/user');
      const updated = store.updateSession(session.id, { status: 'error' });

      expect(updated?.status).toBe('error');
    });
  });

  describe('clearAll', () => {
    it('should remove all sessions', () => {
      store.createSession('/home/user1');
      store.createSession('/home/user2');

      store.clearAll();

      expect(store.listSessions()).toHaveLength(0);
    });
  });
});
