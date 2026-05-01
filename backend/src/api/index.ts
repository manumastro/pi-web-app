import type { Express } from 'express';
import { createDirectoriesRouter } from './directories.js';
import { createMessagesRouter } from './messages.js';
import { createModelsRouter } from './models.js';
import { createSessionsRouter } from './sessions.js';
import { createWorkspaceRouter } from './workspace.js';
import { createForensicsRouter } from './forensics.js';
import { createMaintenanceRouter } from './maintenance.js';
import { createPreferencesRouter } from './preferences.js';
import { createUploadsRouter } from './uploads.js';
import type { RunnerOrchestrator } from '../runner/orchestrator.js';
import type { SessionStore } from '../sessions/store.js';
import type { PreferencesStore } from '../preferences/store.js';
import type { ImageUploadStore } from '../uploads/image-store.js';
import type { Config } from '../config/index.js';

export function registerApiRoutes(
  app: Express,
  params: {
    runner: RunnerOrchestrator;
    sessionStore: SessionStore;
    preferencesStore: PreferencesStore;
    imageUploadStore: ImageUploadStore;
    config: Config;
  },
): void {
  const { runner, sessionStore, preferencesStore, imageUploadStore, config } = params;
  app.use('/api/directories', createDirectoriesRouter(config.homeDir));
  app.use('/api/messages', createMessagesRouter(runner, imageUploadStore));
  app.use('/api/models', createModelsRouter({ runner, sessionStore }));
  app.use('/api/preferences', createPreferencesRouter(preferencesStore));
  app.use('/api/uploads', createUploadsRouter(imageUploadStore));
  app.use('/api/sessions', createSessionsRouter(sessionStore, config.homeDir, imageUploadStore));
  app.use('/api/workspace', createWorkspaceRouter(config.homeDir));
  app.use('/api/forensics', createForensicsRouter(config.sessionsDir));
  app.use('/api/maintenance', createMaintenanceRouter(config));
}
