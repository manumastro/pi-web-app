import { FormEvent } from 'react';

interface ChatInputProps {
  text: string;
  loading: boolean;
  canSend: boolean;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export function ChatInput({ text, loading, canSend, onChange, onSubmit }: ChatInputProps) {
  return (
    <form className="oc-input-wrap" onSubmit={onSubmit}>
      <input value={text} onChange={(e) => onChange(e.target.value)} placeholder="Scrivi un messaggio..." />
      <button type="submit" disabled={!canSend}>{loading ? '…' : 'Invia'}</button>
    </form>
  );
}
