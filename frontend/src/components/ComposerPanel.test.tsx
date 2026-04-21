import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ComposerPanel from './chat/ComposerPanel';

const mockModels = [
  { key: 'anthropic/claude-3-5-sonnet', id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', available: true, active: false, provider: 'anthropic', reasoning: true },
  { key: 'google-gemini/gemini-pro', id: 'gemini-pro', label: 'Gemini Pro', available: true, active: true, provider: 'google-gemini', reasoning: true },
  { key: 'openai/gpt-4o', id: 'gpt-4o', label: 'GPT-4o', available: true, active: false, provider: 'openai', reasoning: false },
];

beforeEach(() => {
  localStorage.clear();
});

describe('ComposerPanel', () => {
  it('renders the stop action while streaming and hides send', () => {
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

    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
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

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
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

    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('opens a grouped model picker, filters models, and selects the result', async () => {
    const onModelSelect = vi.fn();

    render(
      <ComposerPanel
        prompt="hello world"
        streaming="idle"
        models={mockModels}
        activeModelKey="anthropic/claude-3-5-sonnet"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onModelSelect={onModelSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Claude 3.5 Sonnet' }));

    const searchInput = await screen.findByLabelText('Search models');
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'gpt' } });

    expect(screen.getAllByRole('button', { name: 'Claude 3.5 Sonnet' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'GPT-4o' }));

    expect(onModelSelect).toHaveBeenCalledWith('openai/gpt-4o');
  });

  it('marks favourites in-memory when cache persistence is disabled', async () => {
    render(
      <ComposerPanel
        prompt="hello world"
        streaming="idle"
        models={mockModels}
        activeModelKey="anthropic/claude-3-5-sonnet"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onModelSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Claude 3.5 Sonnet' }));

    const favoriteButtons = await screen.findAllByRole('button', { name: 'Add to favorites' });
    fireEvent.click(favoriteButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Remove from favorites' }).length).toBeGreaterThan(0);
    });
  });

  it('shows an inline thinking-level error when provided', () => {
    render(
      <ComposerPanel
        prompt="hello world"
        streaming="idle"
        models={mockModels}
        activeModelKey="google-gemini/gemini-pro"
        availableThinkingLevels={['minimal', 'low', 'medium']}
        activeThinkingLevel="medium"
        thinkingLevelError="No API key for anthropic/claude-3-5-sonnet-20241022"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onModelSelect={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No API key for anthropic/claude-3-5-sonnet-20241022');
  });
});
