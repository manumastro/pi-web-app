export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  authRequired: boolean;
  description?: string;
  isDefault?: boolean;
}

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    authRequired: true,
    description: 'Balanced model for coding and reasoning.',
    isDefault: true,
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    authRequired: true,
    description: 'General-purpose coding model.',
  },
  {
    id: 'llama-3.1-70b',
    name: 'Llama 3.1 70B',
    provider: 'ollama',
    authRequired: false,
    description: 'Local model for offline usage.',
  },
];

export function listModels(currentModel?: string): ModelInfo[] {
  return DEFAULT_MODELS.map((model) => ({
    ...model,
    isDefault: model.id === (currentModel ?? DEFAULT_MODELS[0]?.id),
  }));
}

export function resolveModel(modelId: string | undefined, fallbackModel?: string): string {
  if (modelId && DEFAULT_MODELS.some((model) => model.id === modelId)) {
    return modelId;
  }
  return fallbackModel ?? DEFAULT_MODELS[0]?.id ?? 'claude-3-5-sonnet-20241022';
}
