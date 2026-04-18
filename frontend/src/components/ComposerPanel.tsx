import type { StreamingState } from '../types';

interface ComposerPanelProps {
  prompt: string;
  streaming: StreamingState;
  onPromptChange: (value: string) => void;
  onSend: () => Promise<void>;
  onAbort: () => Promise<void>;
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

export default function ComposerPanel({
  prompt,
  streaming,
  onPromptChange,
  onSend,
  onAbort,
}: ComposerPanelProps) {
  const isStreaming = streaming === 'streaming';
  const isEmpty = prompt.trim().length === 0;

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
