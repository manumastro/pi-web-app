export interface ModelLike {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: Array<'text' | 'image'>;
  contextWindow?: number;
  maxTokens?: number;
}

export interface ModelSummary {
  key: string;
  id: string;
  provider: string;
  name: string;
  available: boolean;
  authConfigured: boolean;
  reasoning: boolean;
  input: Array<'text' | 'image'>;
  contextWindow: number;
  maxTokens: number;
  isSelected: boolean;
}

export interface ModelReference {
  provider: string;
  modelId: string;
  key: string;
}

export function modelKey(model: Pick<ModelLike, 'provider' | 'id'>): string {
  return `${model.provider}/${model.id}`;
}

export function parseModelKey(value: string | undefined): ModelReference | undefined {
  if (!value) {
    return undefined;
  }

  const [provider, ...rest] = value.split('/');
  if (!provider || rest.length === 0) {
    return undefined;
  }

  const modelId = rest.join('/');
  if (!modelId) {
    return undefined;
  }

  return { provider, modelId, key: `${provider}/${modelId}` };
}

function matchesModelKey(model: ModelLike, value: string): boolean {
  return modelKey(model) === value;
}

function uniqueModelById(models: ModelLike[], modelId: string): ModelLike | undefined {
  const matches = models.filter((model) => model.id === modelId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveModelKey(models: ModelLike[], requested?: string, fallback?: string): string {
  const byRequested = parseModelKey(requested);
  if (byRequested) {
    const match = models.find((model) => matchesModelKey(model, byRequested.key));
    if (match) {
      return modelKey(match);
    }
  }

  if (requested) {
    const byId = uniqueModelById(models, requested);
    if (byId) {
      return modelKey(byId);
    }
  }

  const byFallback = parseModelKey(fallback);
  if (byFallback) {
    const match = models.find((model) => matchesModelKey(model, byFallback.key));
    if (match) {
      return modelKey(match);
    }
  }

  if (fallback) {
    const byFallbackId = uniqueModelById(models, fallback);
    if (byFallbackId) {
      return modelKey(byFallbackId);
    }
  }

  return modelKey(models[0] ?? { provider: 'anthropic', id: 'claude-3-5-sonnet-20241022' });
}

export function summarizeModels(params: {
  models: ModelLike[];
  availableKeys: Set<string>;
  selectedKey?: string;
}): ModelSummary[] {
  const { models, availableKeys, selectedKey } = params;
  return [...models]
    .map((model) => {
      const key = modelKey(model);
      return {
        key,
        id: model.id,
        provider: model.provider,
        name: model.name ?? model.id,
        available: availableKeys.has(key),
        authConfigured: availableKeys.has(key),
        reasoning: model.reasoning ?? false,
        input: model.input ?? ['text'],
        contextWindow: model.contextWindow ?? 128000,
        maxTokens: model.maxTokens ?? 16384,
        isSelected: selectedKey === key,
      };
    });
}
