import { ChevronDown, Maximize2, Plus, SendHorizontal, Settings2, ShieldCheck, Square } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { ModelInfo, StreamingState } from '@/types';

interface ComposerPanelProps {
  prompt: string;
  streaming: StreamingState;
  models: ModelInfo[];
  activeModelKey: string;
  onPromptChange: (value: string) => void;
  onSend: () => Promise<void>;
  onAbort: () => Promise<void>;
  onModelSelect: (modelKey: string) => void;
}

interface ModelGroup {
  provider: string;
  models: ModelInfo[];
}

function groupModelsByProvider(models: ModelInfo[]): ModelGroup[] {
  const groups = new Map<string, ModelInfo[]>();
  for (const model of models) {
    const provider = model.provider ?? 'other';
    const list = groups.get(provider) ?? [];
    list.push(model);
    groups.set(provider, list);
  }
  return Array.from(groups.entries()).map(([provider, groupedModels]) => ({ provider, models: groupedModels }));
}

export function ComposerPanel({
  prompt,
  streaming,
  models,
  activeModelKey,
  onPromptChange,
  onSend,
  onAbort,
  onModelSelect,
}: ComposerPanelProps) {
  const isStreaming = streaming === 'streaming';
  const isEmpty = prompt.trim().length === 0;
  const availableModels = models.filter((model) => model.available);
  const groups = groupModelsByProvider(availableModels);
  const hasAvailableModels = groups.length > 0;
  const selectedModelKey = hasAvailableModels && groups.some((group) => group.models.some((model) => model.key === activeModelKey))
    ? activeModelKey
    : '';

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isEmpty && !isStreaming) {
        void onSend();
      }
    }
  }

  return (
    <div className="composer-panel">
      <div className="composer-form">
        <textarea
          className="composer-textarea"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="@ for files/agents; / for commands; ! for shell"
          rows={4}
          disabled={isStreaming}
          aria-label="Prompt"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        <div className="composer-actions">
          <div className="composer-actions-left">
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Add attachment" title="Add attachment">
              <Plus size={16} />
            </button>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Toggle focus mode" title="Toggle focus mode">
              <Maximize2 size={16} />
            </button>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Enable permission auto-accept" title="Enable permission auto-accept">
              <ShieldCheck size={16} />
            </button>
          </div>

          <div className="composer-actions-right">
            <button type="button" className="composer-preset" aria-label="Default preset" title="Default preset">
              <Settings2 size={14} />
              <span>Default</span>
            </button>

            <div className="composer-model-wrap">
              <select
                className="composer-model-select"
                value={selectedModelKey}
                onChange={(event) => onModelSelect(event.target.value)}
                disabled={isStreaming || !hasAvailableModels}
                aria-label="Select model"
                title="Select model"
              >
                {hasAvailableModels ? (
                  groups.map((group) => (
                    <optgroup key={group.provider} label={group.provider}>
                      {group.models.map((model) => (
                        <option key={model.key} value={model.key}>
                          {model.label}
                        </option>
                      ))}
                    </optgroup>
                  ))
                ) : (
                  <option value="">No models available</option>
                )}
              </select>
              <ChevronDown size={12} className="composer-model-chevron" aria-hidden />
            </div>

            <span className="composer-build-chip">Build</span>

            {isStreaming ? (
              <button
                type="button"
                className="composer-send-button"
                onClick={() => void onAbort()}
                aria-label="Stop"
                title="Stop"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="composer-send-button"
                onClick={() => void onSend()}
                disabled={isEmpty}
                aria-label="Send"
                title="Send"
              >
                <SendHorizontal size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComposerPanel;
