import type { Router, Request, Response } from 'express';
import express from 'express';
import type { PreferencesStore } from '../preferences/store.js';

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function parseModelPreferencesUpdate(body: unknown): Parameters<PreferencesStore['saveModelPreferences']>[0] {
  if (!body || typeof body !== 'object') {
    return {};
  }

  const source = body as Record<string, unknown>;
  const update: Parameters<PreferencesStore['saveModelPreferences']>[0] = {};

  if (Array.isArray(source.favorites)) {
    update.favorites = parseStringList(source.favorites);
  }

  if (Array.isArray(source.recents)) {
    update.recents = parseStringList(source.recents);
  }

  if (Array.isArray(source.collapsedProviders)) {
    update.collapsedProviders = parseStringList(source.collapsedProviders);
  }

  return update;
}

export function createPreferencesRouter(preferencesStore: PreferencesStore): Router {
  const router = express.Router();

  router.get('/models', (_req: Request, res: Response) => {
    const preferences = preferencesStore.getModelPreferences();
    res.json({ preferences });
  });

  router.put('/models', (req: Request, res: Response) => {
    const update = parseModelPreferencesUpdate(req.body);
    const preferences = preferencesStore.saveModelPreferences(update);
    res.json({ preferences });
  });

  return router;
}
