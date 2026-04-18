interface ComposerPanelProps {
  prompt: string;
  setPrompt: (value: string) => void;
  streaming: 'idle' | 'connecting' | 'streaming' | 'error';
  onSend: () => Promise<void>;
  onSteer: () => Promise<void>;
  onFollowUp: () => Promise<void>;
  onAbort: () => Promise<void>;
}

export default function ComposerPanel({
  prompt,
  setPrompt,
  streaming,
  onSend,
  onSteer,
  onFollowUp,
  onAbort,
}: ComposerPanelProps) {
  const disabled = prompt.trim().length === 0;

  return (
    <section className="panel composer">
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Scrivi un prompt..."
        rows={4}
        disabled={streaming === 'streaming'}
      />
      <div className="actions">
        <button onClick={() => void onSend()} disabled={streaming === 'streaming' || disabled}>
          Invia
        </button>
        <button onClick={() => void onSteer()} disabled={disabled}>
          Steer
        </button>
        <button onClick={() => void onFollowUp()} disabled={disabled}>
          Follow-up
        </button>
        <button onClick={() => void onAbort()} disabled={streaming !== 'streaming'}>
          Stop
        </button>
      </div>
      <p className="composer-help">Invia crea un nuovo messaggio, Steer cambia direzione, Follow-up continua il thread.</p>
    </section>
  );
}
