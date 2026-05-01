import { apiGet, apiRequest } from '@/api';

export interface ModelPreferences {
  favorites: string[];
  recents: string[];
  collapsedProviders: string[];
}

const DEFAULT_MODEL_PREFERENCES: ModelPreferences = {
  favorites: [],
  recents: [],
  collapsedProviders: [],
};

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function normalizeModelPreferences(input: unknown): ModelPreferences {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_MODEL_PREFERENCES };
  }

  const source = input as Record<string, unknown>;
  return {
    favorites: normalizeStringList(source.favorites),
    recents: normalizeStringList(source.recents),
    collapsedProviders: normalizeStringList(source.collapsedProviders),
  };
}

export async function fetchModelPreferences(): Promise<ModelPreferences> {
  const payload = await apiGet<{ preferences?: unknown }>('/api/preferences/models');
  return normalizeModelPreferences(payload.preferences);
}

export async function saveModelPreferences(preferences: ModelPreferences): Promise<ModelPreferences> {
  const payload = await apiRequest<{ preferences?: unknown }>('/api/preferences/models', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
  return normalizeModelPreferences(payload.preferences);
}
