import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPreferencesStore } from './store.js';

describe('preferences store', () => {
  it('returns defaults when file is missing and persists updates', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-web-preferences-'));
    const filePath = path.join(tmpDir, 'preferences.json');
    const store = createPreferencesStore(filePath);

    expect(store.getModelPreferences()).toEqual({
      favorites: [],
      recents: [],
      collapsedProviders: [],
    });

    store.saveModelPreferences({
      favorites: [' openai/gpt-4o ', 'openai/gpt-4o', ''],
      recents: ['google-gemini/gemini-pro'],
      collapsedProviders: ['openai'],
    });

    const nextStore = createPreferencesStore(filePath);
    expect(nextStore.getModelPreferences()).toEqual({
      favorites: ['openai/gpt-4o'],
      recents: ['google-gemini/gemini-pro'],
      collapsedProviders: ['openai'],
    });
  });

  it('ignores malformed values while keeping existing fields', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-web-preferences-'));
    const filePath = path.join(tmpDir, 'preferences.json');
    const store = createPreferencesStore(filePath);

    store.saveModelPreferences({ favorites: ['anthropic/claude-3-5-sonnet'] });
    store.saveModelPreferences({ recents: ['openai/gpt-4o'] });

    expect(store.getModelPreferences()).toEqual({
      favorites: ['anthropic/claude-3-5-sonnet'],
      recents: ['openai/gpt-4o'],
      collapsedProviders: [],
    });
  });
});
