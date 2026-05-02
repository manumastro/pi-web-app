import type { Config } from '../../config/index.js';
import type { RunnerOrchestrator } from '../../runner/orchestrator.js';
import type { SessionStore } from '../../sessions/store.js';
import type { SdkGlobalEvent } from '../sdk/types.js';

export interface ApiRouteContext {
  runner: RunnerOrchestrator;
  sessionStore: SessionStore;
  config: Config;
  publishGlobalEvent: (event: SdkGlobalEvent) => void;
}
