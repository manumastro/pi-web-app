import { describe, expect, it } from 'vitest';
import { summarizeModels } from './resolver.js';

describe('summarizeModels input capabilities', () => {
  it('forces image input for known vision-capable OpenAI models even when upstream reports text-only', () => {
    const models = summarizeModels({
      models: [{ provider: 'openai-codex', id: 'gpt-5.3-codex', input: ['text'] }],
      availableKeys: new Set(['openai-codex/gpt-5.3-codex']),
      selectedKey: 'openai-codex/gpt-5.3-codex',
    });

    expect(models[0]?.input).toEqual(['text', 'image']);
  });

  it('keeps text-only inputs for non-vision models', () => {
    const models = summarizeModels({
      models: [{ provider: 'opencode', id: 'big-pickle', input: ['text'] }],
      availableKeys: new Set(['opencode/big-pickle']),
      selectedKey: 'opencode/big-pickle',
    });

    expect(models[0]?.input).toEqual(['text']);
  });
});
