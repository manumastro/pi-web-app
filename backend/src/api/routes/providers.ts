import express, { type Request, type Response } from 'express';
import type { ApiRouteContext } from './context.js';

interface ProviderDescriptor {
  id: string;
  name: string;
  source: string;
  env: string[];
  options: Record<string, unknown>;
  models: unknown[];
}

function modelCapability(model: {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
}) {
  return {
    id: model.id,
    providerID: model.provider,
    api: { id: model.provider, url: '', npm: '' },
    name: model.name,
    capabilities: {
      temperature: true,
      reasoning: model.reasoning,
      attachment: model.input.includes('image'),
      toolcall: true,
      input: {
        text: model.input.includes('text'),
        audio: false,
        image: model.input.includes('image'),
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      context: model.contextWindow,
      maxTokens: model.maxTokens,
    },
  };
}

export function createProviderRoutes(ctx: ApiRouteContext) {
  const { runner } = ctx;
  const router = express.Router();

  router.get('/provider', async (_req: Request, res: Response) => {
    try {
      const models = await runner.listModels();
      const providerMap = new Map<string, ProviderDescriptor>();

      for (const model of models) {
        if (!providerMap.has(model.provider)) {
          providerMap.set(model.provider, {
            id: model.provider,
            name: model.provider,
            source: 'config',
            env: [],
            options: {},
            models: [],
          });
        }
        const provider = providerMap.get(model.provider)!;
        provider.models.push(modelCapability(model));
      }

      const all = Array.from(providerMap.values());
      res.json({ all, default: {}, connected: all });
    } catch {
      res.json({ all: [], default: {}, connected: [] });
    }
  });

  router.get('/provider/auth', (_req: Request, res: Response) => {
    res.json({});
  });

  router.get('/config/providers', async (_req: Request, res: Response) => {
    try {
      const models = await runner.listModels();
      const providerMap = new Map<string, ProviderDescriptor>();

      for (const model of models) {
        if (!providerMap.has(model.provider)) {
          providerMap.set(model.provider, {
            id: model.provider,
            name: model.provider,
            source: 'config',
            env: [],
            options: {},
            models: [],
          });
        }

        const provider = providerMap.get(model.provider)!;
        provider.models.push(modelCapability(model));
      }

      res.json({ providers: Array.from(providerMap.values()), default: {} });
    } catch {
      res.json({ providers: [], default: {} });
    }
  });

  router.get('/models', async (_req: Request, res: Response) => {
    try {
      const models = await runner.listModels();
      res.json({
        models: models.map((model) => ({
          id: model.key,
          providerID: model.provider,
          modelID: model.id,
          name: model.name,
          available: model.available,
          authConfigured: model.authConfigured,
          reasoning: model.reasoning,
          input: model.input,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          isSelected: model.isSelected,
        })),
      });
    } catch {
      res.json({ models: [] });
    }
  });

  router.get('/agent', (_req: Request, res: Response) => {
    res.json([]);
  });

  router.get('/command', (_req: Request, res: Response) => {
    res.json([]);
  });

  return router;
}
