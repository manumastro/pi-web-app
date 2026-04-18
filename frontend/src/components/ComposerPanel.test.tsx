import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ComposerPanel from './ComposerPanel';

describe('ComposerPanel', () => {
  it('renders a compact composer with send and stop actions only', () => {
    const onAbort = vi.fn();

    render(
      <ComposerPanel
        prompt="ciao"
        streaming="streaming"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={onAbort}
      />,
    );

    expect(screen.getByRole('button', { name: 'Invia' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Interrompi' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Interrompi' }));
    expect(onAbort).toHaveBeenCalled();
  });

  it('disables send when prompt is empty', () => {
    render(
      <ComposerPanel
        prompt=""
        streaming="idle"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Invia' })).toBeDisabled();
  });

  it('enables send when prompt has content and not streaming', () => {
    render(
      <ComposerPanel
        prompt="hello world"
        streaming="idle"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Invia' })).toBeEnabled();
  });
});
