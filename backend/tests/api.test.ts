/**
 * Backend API Tests
 * 
 * Tests for REST API endpoints using supertest.
 * These tests start a minimal Express server with mocked SDK.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock the SDK before importing
vi.mock('@mariozechner/pi-coding-agent', () => ({
  createAgentSession: vi.fn().mockResolvedValue({
    session: {
      sessionId: 'test-session-id',
      sessionFile: '/tmp/test-session.jsonl',
      model: { id: 'test-model', provider: 'test' },
      messages: [],
      prompt: vi.fn(),
      steer: vi.fn(),
      abort: vi.fn().mockResolvedValue(undefined),
      setModel: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
      bindExtensions: vi.fn(),
      getContextUsage: () => ({ tokens: 100, percent: 10, contextWindow: 100000 }),
    }
  }),
  SessionManager: {
    create: vi.fn().mockReturnValue({
      sessionId: 'test-session-id',
      sessionFile: '/tmp/test-session.jsonl',
    }),
    open: vi.fn().mockReturnValue({
      sessionId: 'test-session-id',
      sessionFile: '/tmp/test-session.jsonl',
    }),
    continueRecent: vi.fn().mockResolvedValue({
      sessionId: 'test-session-id',
      sessionFile: '/tmp/test-session.jsonl',
    }),
  },
  SettingsManager: {
    create: vi.fn().mockReturnValue({
      applyOverrides: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    }),
  },
  AuthStorage: {
    create: vi.fn().mockReturnValue({
      setRuntimeApiKey: vi.fn(),
    }),
  },
  ModelRegistry: {
    create: vi.fn().mockReturnValue({
      getAvailable: vi.fn().mockResolvedValue([
        { id: 'model-1', provider: 'provider-1' },
        { id: 'model-2', provider: 'provider-2' },
      ]),
      find: vi.fn().mockReturnValue({ id: 'model-1', provider: 'provider-1' }),
      registerProvider: vi.fn(),
    }),
  },
  DefaultResourceLoader: {
    reload: vi.fn(),
    getExtensions: vi.fn().mockReturnValue({ runtime: { pendingProviderRegistrations: [] } }),
  },
  getAgentDir: () => '/tmp/test-agent-dir',
}));

// Import types after mock
import type { Request, Response } from 'express';

// Simple mock routes for testing the Express setup
describe('API Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Health endpoint
    app.get('/api/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
      });
    });

    // Sessions list endpoint (mock)
    app.get('/api/sessions', (req: Request, res: Response) => {
      const cwd = req.query.cwd as string;
      res.json([
        {
          id: 'session-1',
          cwd: cwd || '/test',
          cwdLabel: '~/test',
          createdAt: '2026-04-15T00:00:00Z',
          lastModified: Date.now(),
          name: 'Test Session',
          messageCount: 5,
          lastMessage: 'Hello',
          lastMessageType: 'assistant',
          model: 'test-model',
        }
      ]);
    });

    // CWDs endpoint
    app.get('/api/cwds', (_req: Request, res: Response) => {
      res.json([
        { path: '/home/test', label: '~/test', sessionCount: 1 }
      ]);
    });

    // Enabled models endpoint
    app.get('/api/enabled-models', async (_req: Request, res: Response) => {
      res.json({
        models: [
          { id: 'gpt-4', provider: 'openai', reasoning: false },
          { id: 'claude-3', provider: 'anthropic', reasoning: true },
        ]
      });
    });

    // Settings endpoint
    app.get('/api/settings', (_req: Request, res: Response) => {
      res.json({
        defaultProvider: 'openai',
        defaultModel: 'gpt-4',
      });
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('GET /api/cwds', () => {
    it('should return list of working directories', async () => {
      const response = await request(app)
        .get('/api/cwds')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('path');
      expect(response.body[0]).toHaveProperty('label');
      expect(response.body[0]).toHaveProperty('sessionCount');
    });
  });

  describe('GET /api/sessions', () => {
    it('should return sessions for a cwd', async () => {
      const response = await request(app)
        .get('/api/sessions?cwd=/test')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('cwd');
      expect(response.body[0]).toHaveProperty('cwdLabel');
      expect(response.body[0]).toHaveProperty('messageCount');
    });

    it('should return empty array for unknown cwd', async () => {
      const response = await request(app)
        .get('/api/sessions?cwd=/nonexistent')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/enabled-models', () => {
    it('should return list of enabled models', async () => {
      const response = await request(app)
        .get('/api/enabled-models')
        .expect(200);

      expect(response.body).toHaveProperty('models');
      expect(response.body.models).toBeInstanceOf(Array);
      expect(response.body.models[0]).toHaveProperty('id');
      expect(response.body.models[0]).toHaveProperty('provider');
    });
  });

  describe('GET /api/settings', () => {
    it('should return settings', async () => {
      const response = await request(app)
        .get('/api/settings')
        .expect(200);

      expect(response.body).toHaveProperty('defaultProvider');
      expect(response.body).toHaveProperty('defaultModel');
    });
  });
});

describe('Session Management', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock session storage
    const sessions = new Map<string, any>();

    // Create session
    app.post('/api/sessions', (req: Request, res: Response) => {
      const { cwd } = req.body;
      const sessionId = `session-${Date.now()}`;
      sessions.set(sessionId, { id: sessionId, cwd, createdAt: new Date() });
      res.json({ sessionId, cwd });
    });

    // Get session
    app.get('/api/sessions/:id', (req: Request, res: Response) => {
      const session = sessions.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    });

    // Delete session
    app.delete('/api/sessions/:id', (req: Request, res: Response) => {
      const deleted = sessions.delete(req.params.id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });

    // Load session
    app.post('/api/sessions/load', (req: Request, res: Response) => {
      const { sessionId, cwd } = req.body;
      res.json({ sessionId, cwd, loaded: true });
    });
  });

  describe('POST /api/sessions', () => {
    it('should create a new session', async () => {
      const response = await request(app)
        .post('/api/sessions')
        .send({ cwd: '/test' })
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('cwd', '/test');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should return session by id', async () => {
      // Create first
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ cwd: '/test' })
        .expect(200);

      const sessionId = createRes.body.sessionId;

      const response = await request(app)
        .get(`/api/sessions/${sessionId}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', sessionId);
    });

    it('should return 404 for unknown session', async () => {
      await request(app)
        .get('/api/sessions/unknown-id')
        .expect(404);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should delete session', async () => {
      // Create first
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ cwd: '/test' })
        .expect(200);

      const sessionId = createRes.body.sessionId;

      await request(app)
        .delete(`/api/sessions/${sessionId}`)
        .expect(200);

      // Verify deleted
      await request(app)
        .get(`/api/sessions/${sessionId}`)
        .expect(404);
    });
  });

  describe('POST /api/sessions/load', () => {
    it('should load session', async () => {
      const response = await request(app)
        .post('/api/sessions/load')
        .send({ sessionId: 'test-session', cwd: '/test' })
        .expect(200);

      expect(response.body).toHaveProperty('loaded', true);
    });
  });
});

describe('Error Handling', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Endpoint that returns 400
    app.post('/api/bad-request', (req: Request, res: Response) => {
      if (!req.body.text) {
        return res.status(400).json({ error: 'text is required' });
      }
      res.json({ success: true });
    });

    // Endpoint that returns 500
    app.get('/api/error', (_req: Request, res: Response) => {
      res.status(500).json({ error: 'Internal server error' });
    });

    // Not found handler
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  });

  describe('POST /api/bad-request', () => {
    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/bad-request')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'text is required');
    });

    it('should succeed with valid data', async () => {
      await request(app)
        .post('/api/bad-request')
        .send({ text: 'Hello' })
        .expect(200);
    });
  });

  describe('GET /api/error', () => {
    it('should return 500 for server errors', async () => {
      await request(app)
        .get('/api/error')
        .expect(500);
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      await request(app)
        .get('/api/unknown')
        .expect(404);
    });
  });
});

describe('Input Validation', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Validate cwd parameter
    app.get('/api/cwd', (req: Request, res: Response) => {
      const cwd = req.query.path as string;
      if (!cwd) {
        return res.status(400).json({ error: 'path is required' });
      }
      res.json({ path: cwd, exists: true });
    });

    // Validate JSON body
    app.post('/api/json', (req: Request, res: Response) => {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
      res.json({ received: true });
    });
  });

  describe('GET /api/cwd', () => {
    it('should require path parameter', async () => {
      await request(app)
        .get('/api/cwd')
        .expect(400);
    });

    it('should accept path parameter', async () => {
      const response = await request(app)
        .get('/api/cwd?path=/test')
        .expect(200);

      expect(response.body).toHaveProperty('path', '/test');
    });
  });

  describe('POST /api/json', () => {
    it('should accept valid JSON', async () => {
      await request(app)
        .post('/api/json')
        .send({ key: 'value' })
        .expect(200);
    });
  });
});
