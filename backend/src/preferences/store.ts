import fs from 'node:fs';
import path from 'node:path';

export interface ModelPreferences {
  favorites: string[];
  recents: string[];
  collapsedProviders: string[];
}

export interface PreferencesStore {
  getModelPreferences: () => ModelPreferences;
  saveModelPreferences: (input: Partial<ModelPreferences>) => ModelPreferences;
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

function normalizeModelPreferences(value: unknown): ModelPreferences {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_MODEL_PREFERENCES };
  }

  const input = value as Partial<Record<keyof ModelPreferences, unknown>>;
  return {
    favorites: normalizeStringList(input.favorites),
    recents: normalizeStringList(input.recents),
    collapsedProviders: normalizeStringList(input.collapsedProviders),
  };
}

function readModelPreferencesSync(filePath: string): ModelPreferences {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return normalizeModelPreferences(parsed);
  } catch {
    return { ...DEFAULT_MODEL_PREFERENCES };
  }
}

function writeModelPreferencesSync(filePath: string, preferences: ModelPreferences): void {
  const tmpPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, `${JSON.stringify(preferences, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export function createPreferencesStore(filePath: string): PreferencesStore {
  let modelPreferences = readModelPreferencesSync(filePath);

  const clonePreferences = (): ModelPreferences => ({
    favorites: [...modelPreferences.favorites],
    recents: [...modelPreferences.recents],
    collapsedProviders: [...modelPreferences.collapsedProviders],
  });

  return {
    getModelPreferences(): ModelPreferences {
      return clonePreferences();
    },
    saveModelPreferences(input: Partial<ModelPreferences>): ModelPreferences {
      const merged = normalizeModelPreferences({
        ...modelPreferences,
        ...input,
      });
      modelPreferences = merged;
      writeModelPreferencesSync(filePath, modelPreferences);
      return clonePreferences();
    },
  };
}
