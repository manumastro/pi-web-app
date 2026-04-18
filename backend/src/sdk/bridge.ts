import type { SseEvent } from './events.js';
import { DoneEventSchema, TextChunkEventSchema } from './events.js';
import type { Config } from '../config/index.js';
import type { SessionStore } from '../sessions/store.js';
import { createSessionStore } from '../sessions/store.js';
import type { SseManager } from '../sse/manager.js';
import { resolveModel } from '../models/resolver.js';

export interface PromptRequest {
  sessionId?: string;
  cwd?: string;
  message: string;
  model?: string;
}

export interface PromptResult {
  sessionId: string;
  assistantMessage: string;
}

export interface SdkBridge {
  prompt: (request: PromptRequest) => Promise<PromptResult>;
  abort: (sessionId: string) => Promise<void>;
  setModel: (sessionId: string, modelId: string) => Promise<void>;
}

interface ActiveRun {
  aborted: boolean;
  timers: NodeJS.Timeout[];
  assistantMessageId: string;
}

function now(): string {
  return new Date().toISOString();
}

function emit(manager: SseManager, event: SseEvent): void {
  manager.broadcast(event);
}

export function createMockSdkBridge(params: {
  config: Config;
  sessionStore?: SessionStore;
  sseManager: SseManager;
}): SdkBridge {
  const { config, sseManager } = params;
  const sessionStore = params.sessionStore ?? createSessionStore();
  const activeRuns = new Map<string, ActiveRun>();

  async function prompt(request: PromptRequest): Promise<PromptResult> {
    const sessionId = request.sessionId ?? config.generateSessionId();
    const cwd = request.cwd ?? config.sdkCwd;
    const model = resolveModel(request.model, config.model);
    const session = sessionStore.getSession(sessionId) ?? sessionStore.createSession(cwd, model, sessionId);

    sessionStore.updateSession(session.id, { status: 'prompting', model, cwd });
    sessionStore.addMessage(session.id, { role: 'user', content: request.message });

    const assistantMessageId = config.generateSessionId();
    const run: ActiveRun = { aborted: false, timers: [], assistantMessageId };
    activeRuns.set(session.id, run);

    const responseText = `Ricevuto: ${request.message}. Questo è un mock in attesa dell'integrazione con l'SDK reale.`;
    const chunks = responseText.match(/.{1,24}(?:\s|$)/g) ?? [responseText];

    chunks.forEach((chunk, index) => {
      const timer = setTimeout(() => {
        const currentRun = activeRuns.get(session.id);
        if (!currentRun || currentRun.aborted) {
          return;
        }

        emit(sseManager, {
          type: 'text_chunk',
          sessionId: session.id,
          messageId: assistantMessageId,
          content: chunk,
          timestamp: now(),
        });

        if (index === chunks.length - 1) {
          sessionStore.addMessage(session.id, { role: 'assistant', content: responseText });
          sessionStore.updateSession(session.id, { status: 'done' });
          emit(sseManager, {
            type: 'done',
            sessionId: session.id,
            messageId: assistantMessageId,
            aborted: false,
            timestamp: now(),
          });
          activeRuns.delete(session.id);
        }
      }, 150 + index * 35);
      run.timers.push(timer);
    });

    return { sessionId: session.id, assistantMessage: responseText };
  }

  async function abort(sessionId: string): Promise<void> {
    const run = activeRuns.get(sessionId);
    if (run) {
      run.aborted = true;
      for (const timer of run.timers) {
        clearTimeout(timer);
      }
      activeRuns.delete(sessionId);
    }

    sessionStore.updateSession(sessionId, { status: 'done' });
    emit(sseManager, {
      type: 'done',
      sessionId,
      messageId: run?.assistantMessageId ?? config.generateSessionId(),
      aborted: true,
      timestamp: now(),
    });
  }

  async function setModel(sessionId: string, modelId: string): Promise<void> {
    sessionStore.updateSession(sessionId, { model: resolveModel(modelId, config.model) });
  }

  return { prompt, abort, setModel };
}
