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

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M12.5 7L1.5 1.5l2 5.5-2 5.5 11-4.5z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

interface ModelGroup {
  provider: string;
  models: ModelInfo[];
}

function groupModelsByProvider(models: ModelInfo[]): ModelGroup[] {
  const groups = new Map<string, ModelInfo[]>();
  for (const model of models) {
    const p = model.provider ?? 'other';
    const list = groups.get(p) ?? [];
    list.push(model);
    groups.set(p, list);
  }
  return Array.from(groups.entries()).map(([provider, ms]) => ({ provider, models: ms }));
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
  const availableModels = models.filter((m) => m.available);
  const groups = groupModelsByProvider(availableModels);
  const hasAvailableModels = groups.length > 0;
  const selectedModelKey = hasAvailableModels && groups.some((group) => group.models.some((m) => m.key === activeModelKey))
    ? activeModelKey
    : '';

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
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
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un prompt… (Enter per inviare, Shift+Enter per andare a capo)"
          rows={3}
          disabled={isStreaming}
          aria-label="Prompt"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        <div className="composer-actions">
          {/* Model selector */}
          <div className="model-selector">
            <select
              className="model-select"
              value={selectedModelKey}
              onChange={(e) => {
                if (e.target.value === '__manage__') {
                  return;
                }
                onModelSelect(e.target.value);
              }}
              disabled={isStreaming || !hasAvailableModels}
              title="Seleziona modello"
              aria-label="Seleziona modello"
            >
              {hasAvailableModels ? (
                groups.map((group) => (
                  <optgroup key={group.provider} label={group.provider}>
                    {group.models.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))
              ) : (
                <option value="">Nessun modello disponibile</option>
              )}
            </select>
          </div>

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              type="button"
              className="stop-button"
              onClick={() => void onAbort()}
              aria-label="Interrompi"
              title="Interrompi"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              className="send-button"
              onClick={() => void onSend()}
              disabled={isEmpty}
              aria-label="Invia"
              title="Invia (Enter)"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ComposerPanel;
