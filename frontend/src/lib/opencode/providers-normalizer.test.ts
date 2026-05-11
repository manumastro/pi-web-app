import { describe, expect, it } from 'vitest';
import { normalizeBackendProviders } from './providers-normalizer';

describe('normalizeBackendProviders', () => {
  it('normalizes backend /api/config/providers shape (models array)', () => {
    const providers = normalizeBackendProviders([
      {
        id: 'opencode-go',
        name: 'opencode-go',
        models: [
          { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', reasoning: true },
          { modelID: 'deepseek-r1', reasoning: true },
        ],
      },
    ]);

    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe('opencode-go');
    expect(providers[0].models.map((m) => m.id)).toEqual(['deepseek-v4-flash', 'deepseek-r1']);
    expect((providers[0].models[1] as { name: string }).name).toBe('deepseek-r1');
  });

  it('normalizes backend providers with object models map', () => {
    const providers = normalizeBackendProviders([
      {
        id: 'zen',
        models: {
          'big-pickle': { id: 'big-pickle', name: 'Big Pickle' },
        },
      },
    ]);

    expect(providers).toHaveLength(1);
    expect(providers[0].models.map((m) => m.id)).toEqual(['big-pickle']);
  });
});
