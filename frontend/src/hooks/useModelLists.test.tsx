import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  providers: [] as Array<{ id: string; models: Array<{ id: string; name: string }> | Record<string, unknown> }>,
  favoriteModels: [] as Array<{ providerID: string; modelID: string }>,
  recentModels: [] as Array<{ providerID: string; modelID: string }>,
  hiddenModels: [] as Array<{ providerID: string; modelID: string }>,
};

vi.mock('@/stores/useConfigStore', () => ({
  useConfigStore: (selector: (value: { providers: unknown[] }) => unknown) => selector({ providers: state.providers }),
}));

vi.mock('@/stores/useUIStore', () => ({
  useUIStore: (selector: (value: {
    favoriteModels: unknown[];
    recentModels: unknown[];
    hiddenModels: unknown[];
  }) => unknown) => selector({
    favoriteModels: state.favoriteModels,
    recentModels: state.recentModels,
    hiddenModels: state.hiddenModels,
  }),
}));

describe('useModelLists', () => {
  beforeEach(() => {
    state.providers = [
      {
        id: 'demo',
        models: [
          { id: 'model-a', name: 'Model A' },
          { id: 'model-b', name: 'Model B' },
        ],
      },
      {
        id: 'legacy',
        models: { anything: true },
      },
    ];

    state.favoriteModels = [{ providerID: 'demo', modelID: 'model-a' }];
    state.recentModels = [
      { providerID: 'demo', modelID: 'model-a' },
      { providerID: 'demo', modelID: 'model-b' },
      { providerID: 'legacy', modelID: 'broken-model' },
    ];
    state.hiddenModels = [];
  });

  it('builds favorite and recent lists without crashing when provider.models is not an array', async () => {
    const { useModelLists } = await import('./useModelLists');
    const { result } = renderHook(() => useModelLists());

    expect(result.current.favoriteModelsList).toHaveLength(1);
    expect(result.current.favoriteModelsList[0]?.modelID).toBe('model-a');

    expect(result.current.recentModelsList).toHaveLength(1);
    expect(result.current.recentModelsList[0]?.modelID).toBe('model-b');
  });

  it('filters hidden models from both lists', async () => {
    state.hiddenModels = [{ providerID: 'demo', modelID: 'model-b' }];

    const { useModelLists } = await import('./useModelLists');
    const { result } = renderHook(() => useModelLists());

    expect(result.current.favoriteModelsList).toHaveLength(1);
    expect(result.current.recentModelsList).toHaveLength(0);
  });
});
