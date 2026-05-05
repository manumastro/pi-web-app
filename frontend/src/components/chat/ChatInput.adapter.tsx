import React from 'react';

interface ChatInputProps {
  text?: string;
  loading?: boolean;
  canSend?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
}

export const ChatInput = React.memo(function ChatInputAdapter(props: ChatInputProps) {
  const { text = '', loading = false, canSend = false, onChange, onSubmit } = props;

  return (
    <form className="oc-input-wrap oc-input-wrap-clone" onSubmit={onSubmit}>
      <button type="button" className="oc-icon-btn" title="Allega" aria-label="Allega file">+</button>
      <textarea
        rows={1}
        value={text}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="Scrivi un messaggio…"
        className="oc-textarea"
      />
      <button type="submit" disabled={!canSend} className="oc-send-btn" title="Invia">{loading ? '…' : '↑'}</button>
    </form>
  );
});
