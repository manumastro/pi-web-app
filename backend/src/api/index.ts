import type { Express } from 'express';
import { createDirectoriesRouter } from './directories.js';
import { createMessagesRouter } from './messages.js';
import { createModelsRouter } from './models.js';
import { createSessionsRouter } from './sessions.js';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';
import type { SessionStore } from '../sessions/store.js';
import type { Config } from '../config/index.js';

export function registerApiRoutes(app: Express, params: { bridge: RunnerOrchestrator; sessionStore: SessionStore; config: Config }): void {
  const { bridge, sessionStore, config } = params;
  app.use('/api/directories', createDirectoriesRouter(config.homeDir));
  app.use('/api/messages', createMessagesRouter(bridge));
  app.use('/api/models', createModelsRouter({ bridge, sessionStore }));
  app.use('/api/sessions', createSessionsRouter(sessionStore, config.homeDir));
}
