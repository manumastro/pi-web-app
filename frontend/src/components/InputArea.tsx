import { useState, useRef, useCallback } from 'react';

interface InputAreaProps {
  onSend: (text: string, images?: string[]) => void;
  onStop?: () => void;
  isBusy?: boolean;
  disabled: boolean;
}

export function InputArea({ onSend, onStop, isBusy, disabled }: InputAreaProps) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || disabled) return;
    onSend(trimmed || '(image)', images.length > 0 ? images : undefined);
    setText('');
    setImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, images, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setImages(prev => [...prev, reader.result as string]);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImages(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="p-3 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex-shrink-0 relative z-10">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-2 max-w-[1000px] mx-auto">
          {images.map((src, i) => (
            <div key={i} className="relative w-[60px] h-[60px] rounded-md overflow-hidden border border-[var(--color-border)]">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-0.5 right-0.5 bg-black/70 text-[var(--color-red)] rounded-full w-[18px] h-[18px] text-xs flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2.5 max-w-[1000px] mx-auto items-end">
        {/* Gallery button - select from device */}
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled && !isBusy}
          className="w-[42px] h-[42px] rounded-full border border-[var(--color-border)] text-[var(--color-text-dim)] flex items-center justify-center hover:bg-[var(--color-surface-2)] shrink-0 disabled:opacity-50"
          title="Add Image"
        >
          +
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Ask pi anything…"
          rows={1}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] px-3.5 py-2.5 text-[var(--color-text)] text-base outline-none resize-none min-h-[42px] max-h-[180px] leading-relaxed focus:border-[var(--color-accent)] disabled:opacity-50 placeholder:text-[var(--color-text-dim)]"
        />
        {isBusy ? (
          <button
            onClick={onStop}
            className="bg-[var(--color-red)] text-white rounded-[10px] px-4 h-[42px] font-semibold text-sm hover:opacity-85 flex items-center justify-center"
            title="Stop Agent"
          >
            ⏹
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || (!text.trim() && images.length === 0)}
            className="bg-[var(--color-accent)] text-white rounded-[10px] px-4 h-[42px] font-semibold text-sm hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center"
            title="Send Message"
          >
            ▶
          </button>
        )}
      </div>
      <div className="text-center text-[10px] text-[var(--color-text-dim)] mt-1.5">
        Enter to send · Shift+Enter new line · Ctrl+V images
      </div>
    </div>
  );
}
