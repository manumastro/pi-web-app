import type { Express } from 'express';
import { createMessagesRouter } from './messages.js';
import { createModelsRouter } from './models.js';
import { createSessionsRouter } from './sessions.js';
import type { SdkBridge } from '../sdk/bridge.js';
import type { SessionStore } from '../sessions/store.js';

export function registerApiRoutes(app: Express, params: { bridge: SdkBridge; sessionStore: SessionStore }): void {
  const { bridge, sessionStore } = params;
  app.use('/api/messages', createMessagesRouter(bridge));
  app.use('/api/models', createModelsRouter({ bridge, sessionStore }));
  app.use('/api/sessions', createSessionsRouter(sessionStore));
}
