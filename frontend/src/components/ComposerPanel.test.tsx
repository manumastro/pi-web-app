import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ComposerPanel from './ComposerPanel';

const mockModels = [
  { key: 'github-copilot/claude-3-5-sonnet', id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', available: true, active: false, provider: 'github-copilot' },
  { key: 'google-gemini/gemini-pro', id: 'gemini-pro', label: 'Gemini Pro', available: true, active: true, provider: 'google-gemini' },
];

describe('ComposerPanel', () => {
  it('renders a compact composer with send and stop actions only', () => {
    const onAbort = vi.fn();

    render(
      <ComposerPanel
        prompt="ciao"
        streaming="streaming"
        models={mockModels}
        activeModelKey="google-gemini/gemini-pro"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={onAbort}
        onModelSelect={vi.fn()}
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
        models={mockModels}
        activeModelKey="google-gemini/gemini-pro"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onModelSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Invia' })).toBeDisabled();
  });

  it('enables send when prompt has content and not streaming', () => {
    render(
      <ComposerPanel
        prompt="hello world"
        streaming="idle"
        models={mockModels}
        activeModelKey="google-gemini/gemini-pro"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onModelSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Invia' })).toBeEnabled();
  });
});