interface ConnectionStatusBannerProps {
  streaming: 'idle' | 'connecting' | 'streaming' | 'error';
  statusMessage: string;
  error?: string;
}

export default function ConnectionStatusBanner({ streaming, statusMessage, error }: ConnectionStatusBannerProps) {
  const className = ['connection-banner', `connection-banner-${streaming}`, error ? 'connection-banner-error' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} role="status" aria-live="polite">
      <strong>{statusMessage}</strong>
      {error ? <span>{error}</span> : null}
    </div>
  );
}
