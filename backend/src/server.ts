import express from 'express';
import cors from 'cors';
import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { loadConfig } from './config/index.js';
import { createPersistentSessionStore } from './sessions/persistent-store.js';
import { createPreferencesStore } from './preferences/store.js';
import { createSseManager } from './sse/manager.js';
import { createSseRouter } from './sse/handler.js';
import { createRunnerOrchestrator } from './runner/orchestrator.js';
import { createImageUploadStore } from './uploads/image-store.js';
import { installRelayServer } from './relay/server.js';
import { registerApiRoutes } from './api/index.js';

export function createApp() {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const sessionStore = createPersistentSessionStore(config.sessionsDir);
  sessionStore.hydrateSync();
  const preferencesStore = createPreferencesStore(path.join(config.homeDir, '.pi', 'agent', 'pi-web-preferences.json'));
  const sseManager = createSseManager(path.join(config.sessionsDir, '.sse-history'));
  const imageUploadStore = createImageUploadStore(path.join(config.sessionsDir, '.uploads'));
  const runner = createRunnerOrchestrator({ config, sessionStore, sseManager });

  const app = express();
  app.use(express.json({ limit: '30mb' }));
  app.use(cors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : true }));
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, url: req.url }, 'request');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, clients: sseManager.clientCount() });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      homeDir: config.homeDir,
      piCwd: config.piCwd,
      sessionsDir: config.sessionsDir,
      systemd: {
        restartEnabled: config.restartStrategy !== 'disabled',
        service: config.systemdServiceName,
        strategy: config.restartStrategy,
      },
    });
  });

  registerApiRoutes(app, { runner, sessionStore, preferencesStore, imageUploadStore, config });
  app.use('/api/events', createSseRouter(sseManager, sessionStore));

  // Keep this before static SPA catch-all so frontend relay health checks never get index.html.
  app.get('/api/relay/status', (_req, res) => {
    res.json({
      viewers: 0,
      sessions: {},
      transport: 'websocket',
      path: '/api/relay',
    });
  });

  const disableFrontendHttpCache = (process.env.PI_WEB_DISABLE_FRONTEND_HTTP_CACHE ?? 'true').toLowerCase() !== 'false';
  const applyNoStoreHeaders = (res: express.Response): void => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  };

  const publicDir = path.resolve(process.cwd(), 'dist/public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, {
      etag: !disableFrontendHttpCache,
      lastModified: !disableFrontendHttpCache,
      maxAge: disableFrontendHttpCache ? 0 : undefined,
      setHeaders: (res) => {
        if (disableFrontendHttpCache) {
          applyNoStoreHeaders(res);
        }
      },
    }));
    app.get('*', (_req, res) => {
      if (disableFrontendHttpCache) {
        applyNoStoreHeaders(res);
      }
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  return { app, config, logger, sessionStore, sseManager, orchestrator: runner };
}

export function createHttpServer() {
  const runtime = createApp();
  const server = http.createServer(runtime.app);
  const relay = installRelayServer({
    server,
    orchestrator: runtime.orchestrator,
    sessionStore: runtime.sessionStore,
    sseManager: runtime.sseManager,
  });

  return { ...runtime, server, relay };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { server, config, logger } = createHttpServer();
  server.listen(config.port, () => {
    logger.info({ port: config.port }, 'pi-web backend listening');
  });
}
