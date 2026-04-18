import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectionStatusBanner from './ConnectionStatusBanner';

describe('ConnectionStatusBanner', () => {
  it('renders the current status and error', () => {
    render(<ConnectionStatusBanner streaming="connecting" statusMessage="Connessione persa" error="retrying" />);

    expect(screen.getByRole('status')).toHaveClass('connection-banner', 'connection-banner-connecting', 'connection-banner-error');
    expect(screen.getByText('Connessione persa')).toBeInTheDocument();
    expect(screen.getByText('retrying')).toBeInTheDocument();
  });
});
