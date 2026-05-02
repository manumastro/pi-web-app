import type { Express } from 'express';
import type { RunnerOrchestrator } from '../../runner/orchestrator.js';
import type { SessionStore } from '../../sessions/store.js';
import type { SseManager } from '../../sse/manager.js';
import type { Config } from '../../config/index.js';
import { createSessionRoutes } from './sessions.js';
import { createProviderRoutes } from './providers.js';
import { createProjectRoutes } from './projects.js';
import { createFilesystemRoutes } from './filesystem.js';
import { createGitRoutes } from './git.js';
import { createMiscRoutes } from './misc.js';
import { createGlobalEventBridge } from './global-events.js';

export function installApiRoutes(
  app: Express,
  params: {
    runner: RunnerOrchestrator;
    sessionStore: SessionStore;
    sseManager: SseManager;
    config: Config;
  },
): void {
  const { runner, sessionStore, sseManager, config } = params;

  const globalBridge = createGlobalEventBridge({ sseManager, sessionStore, config });

  const routeContext = {
    runner,
    sessionStore,
    config,
    publishGlobalEvent: globalBridge.publish,
  };

  app.use('/api', createSessionRoutes(routeContext));
  app.use('/api', createProviderRoutes(routeContext));
  app.use('/api', createProjectRoutes(routeContext));
  app.use('/api', createFilesystemRoutes(routeContext));
  app.use('/api', createGitRoutes(routeContext));
  app.use('/api', createMiscRoutes(routeContext));
  app.use('/api', globalBridge.router);
}
