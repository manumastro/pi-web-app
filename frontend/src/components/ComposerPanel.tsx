import type { ModelInfo, StreamingState } from '../types';

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

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

export default function ComposerPanel({
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
  const groups = groupModelsByProvider(models.filter((m) => m.available));

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
              value={activeModelKey}
              onChange={(e) => {
                if (e.target.value === '__manage__') {
                  // Open model filter in sidebar — for now just focus the filter
                  return;
                }
                onModelSelect(e.target.value);
              }}
              disabled={isStreaming}
              title="Seleziona modello"
              aria-label="Seleziona modello"
            >
              {groups.map((group) => (
                <optgroup key={group.provider} label={group.provider}>
                  {group.models.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="model-select-chevron">
              <ChevronDownIcon />
            </span>
          </div>

          <span className="composer-hint">
            {isStreaming ? 'Streaming in corso…' : 'Enter invia · Shift+Enter nuova riga'}
          </span>

          <div className="composer-buttons">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void onAbort()}
              disabled={!isStreaming}
              title="Interrompi lo streaming"
              aria-label="Interrompi"
            >
              <StopIcon />
              Stop
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void onSend()}
              disabled={isEmpty || isStreaming}
              title="Invia il prompt"
              aria-label="Invia"
            >
              <SendIcon />
              Invia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}