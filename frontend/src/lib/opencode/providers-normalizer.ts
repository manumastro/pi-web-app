import type { Provider } from '@opencode-ai/sdk/v2';

type ProviderModelLike = Record<string, unknown>;

export function normalizeBackendProviders(rawProviders: unknown[]): Provider[] {
  return rawProviders
    .map((rawProvider, providerIndex) => {
      if (!rawProvider || typeof rawProvider !== 'object') return null;
      const provider = rawProvider as Record<string, unknown>;

      const providerId =
        (typeof provider.id === 'string' && provider.id) ||
        (typeof provider.name === 'string' && provider.name) ||
        `provider-${providerIndex}`;

      const modelSource = provider.models;
      const modelItems: ProviderModelLike[] = Array.isArray(modelSource)
        ? modelSource.filter((item): item is ProviderModelLike => !!item && typeof item === 'object')
        : Object.values((modelSource as Record<string, unknown>) ?? {}).filter(
            (item): item is ProviderModelLike => !!item && typeof item === 'object',
          );

      const models = modelItems.map((model, modelIndex) => {
        const modelId =
          (typeof model.id === 'string' && model.id) ||
          (typeof model.modelID === 'string' && model.modelID) ||
          `model-${modelIndex}`;

        return {
          ...model,
          id: modelId,
          name: (typeof model.name === 'string' && model.name) ? model.name : modelId,
          providerID:
            (typeof model.providerID === 'string' && model.providerID) ||
            (typeof model.providerId === 'string' && model.providerId) ||
            providerId,
        };
      });

      return {
        ...provider,
        id: providerId,
        name: (typeof provider.name === 'string' && provider.name) ? provider.name : providerId,
        models,
      } as Provider;
    })
    .filter((provider): provider is Provider => provider !== null);
}
