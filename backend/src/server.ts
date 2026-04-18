import express from 'express';
import cors from 'cors';
import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig } from './config/index.js';
import { createPersistentSessionStore } from './sessions/persistent-store.js';
import { createSseManager } from './sse/manager.js';
import { createSseRouter } from './sse/handler.js';
import { createMockSdkBridge } from './sdk/bridge.js';
import { registerApiRoutes } from './api/index.js';

export function createApp() {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const sessionStore = createPersistentSessionStore(config.sessionsDir);
  sessionStore.hydrateSync();
  const sseManager = createSseManager();
  const bridge = createMockSdkBridge({ config, sessionStore, sseManager });

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : true }));
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, url: req.url }, 'request');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, clients: sseManager.clientCount() });
  });

  registerApiRoutes(app, { bridge, sessionStore });
  app.use('/api/events', createSseRouter(sseManager));

  const publicDir = path.resolve(process.cwd(), 'dist/public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  return { app, config, logger, sessionStore, sseManager };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, config, logger } = createApp();
  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'pi-web backend listening');
  });
}
