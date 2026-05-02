import express from 'express';
import cors from 'cors';
import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { loadConfig } from './config/index.js';
import { createPersistentSessionStore } from './sessions/persistent-store.js';
import { createSseManager } from './sse/manager.js';
import { createRunnerOrchestrator } from './runner/orchestrator.js';
import { installRelayServer } from './relay/server.js';
import { installApiRoutes } from './api/routes/install.js';

export function createApp() {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const sessionStore = createPersistentSessionStore(config.sessionsDir);
  sessionStore.hydrateSync();
  const sseManager = createSseManager(path.join(config.sessionsDir, '.sse-history'));
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

  const settingsFilePath = path.join(config.homeDir, '.pi', 'agent', 'pi-web-settings.json');
  const legacySettingsFilePath = path.join(config.homeDir, '.pi', 'agent', 'pi-web-openchamber-settings.json');

  const readSettings = (): Record<string, unknown> => {
    const readPath = fs.existsSync(settingsFilePath) ? settingsFilePath : legacySettingsFilePath;
    try {
      const raw = fs.readFileSync(readPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  const writeSettings = (settings: Record<string, unknown>): void => {
    fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true });
    const tmpPath = `${settingsFilePath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, settingsFilePath);
  };

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

  app.get('/api/config/settings', (_req, res) => {
    const settings = readSettings();
    const defaultModel = typeof settings.defaultModel === 'string' && settings.defaultModel.trim().length > 0
      ? settings.defaultModel
      : (config.model ?? 'openai-codex/gpt-5.4-mini');
    res.json({
      ...settings,
      defaultModel,
      homeDirectory: config.homeDir,
      homeDir: config.homeDir,
    });
  });

  app.put('/api/config/settings', (req, res) => {
    const current = readSettings();
    const update = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const next = { ...current, ...update };
    writeSettings(next);
    res.json(next);
  });

  installApiRoutes(app, { runner, sessionStore, sseManager, config });

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
    app.get('*', (req, res) => {
      const requestPath = req.path || '';
      if (
        requestPath.startsWith('/api/')
        || requestPath.startsWith('/assets/')
        || requestPath.startsWith('/icons/')
        || requestPath === '/manifest.webmanifest'
        || requestPath === '/sw.js'
      ) {
        res.status(404).json({ error: 'Not Found' });
        return;
      }

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
