import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ComposerPanel from './chat/ComposerPanel';

const mockUseSessionStatus = vi.fn();

vi.mock('@/sync/sync-context', () => ({
  useSessionStatus: (...args: unknown[]) => mockUseSessionStatus(...args),
}));

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
    matches,
    media: '(max-width: 1024px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

const mockModels = [
  { key: 'anthropic/claude-3-5-sonnet', id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', available: true, active: false, provider: 'anthropic', reasoning: true },
  { key: 'google-gemini/gemini-pro', id: 'gemini-pro', label: 'Gemini Pro', available: true, active: true, provider: 'google-gemini', reasoning: true },
  { key: 'openai/gpt-4o', id: 'gpt-4o', label: 'GPT-4o', available: true, active: false, provider: 'openai', reasoning: false },
];

beforeEach(() => {
  vi.unstubAllGlobals();
  mockMatchMedia(false);
  localStorage.clear();
  mockUseSessionStatus.mockReset();
  mockUseSessionStatus.mockReturnValue(undefined);
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

  it('orders provider groups and models like the CLI', async () => {
    render(
      <ComposerPanel
        prompt="hello world"
        streaming="idle"
        models={[
          { key: 'openai/z-model', id: 'z-model', label: 'Z model', available: true, active: false, provider: 'openai', reasoning: false },
          { key: 'anthropic/b-model', id: 'b-model', label: 'B model', available: true, active: false, provider: 'anthropic', reasoning: true },
          { key: 'anthropic/a-model', id: 'a-model', label: 'A model', available: true, active: true, provider: 'anthropic', reasoning: true },
        ]}
        activeModelKey="anthropic/a-model"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onModelSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'A model' }));

    const panel = await screen.findByLabelText('Search models');
    const menuText = panel.closest('.absolute')?.textContent ?? '';
    expect(menuText.indexOf('Anthropic')).toBeLessThan(menuText.indexOf('Openai'));
    expect(menuText.indexOf('A model')).toBeLessThan(menuText.indexOf('B model'));
  });

  it('opens mobile controls in a bottom sheet on compact layouts', async () => {
    mockMatchMedia(true);

    render(
      <ComposerPanel
        prompt="hello world"
        streaming="idle"
        models={mockModels}
        activeModelKey="google-gemini/gemini-pro"
        availableThinkingLevels={['minimal', 'medium', 'high']}
        activeThinkingLevel="medium"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onModelSelect={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gemini Pro' }));

    const dialog = await screen.findByRole('dialog');
    const dialogScope = within(dialog);
    expect(dialog).toBeInTheDocument();
    expect(dialogScope.getByText('Controls')).toBeInTheDocument();
    expect(dialogScope.getByText('Choose model')).toBeInTheDocument();

    fireEvent.click(dialogScope.getByRole('button', { name: /Back/i }));
    expect(dialogScope.getByText('Model')).toBeInTheDocument();
    expect(dialogScope.getByText('Thinking')).toBeInTheDocument();
  });

  it('shows detailed context usage on mobile and inside controls overview', async () => {
    mockMatchMedia(true);
    mockUseSessionStatus.mockReturnValue({
      metadata: {
        contextWindow: 1_000_000,
        inputTokens: 2_500_000,
        outputTokens: 158_000,
        totalTokens: 2_900_000,
        cost: 2.371,
        contextPercent: 12.8,
        autoCompactionEnabled: true,
        cacheReadTokens: 125_000,
      },
    });

    render(
      <ComposerPanel
        prompt="hello world"
        streaming="idle"
        models={mockModels}
        activeModelKey="google-gemini/gemini-pro"
        availableThinkingLevels={['minimal', 'medium', 'high']}
        activeThinkingLevel="medium"
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onModelSelect={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/\$2\.371/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gemini Pro' }));

    const dialog = await screen.findByRole('dialog');
    const dialogScope = within(dialog);
    fireEvent.click(dialogScope.getByRole('button', { name: /Back/i }));

    expect(dialogScope.getByText('Context')).toBeInTheDocument();
    expect(dialogScope.getByText(/\$2\.371/)).toBeInTheDocument();
    expect(dialogScope.getByText(/Cache read: 125,000/)).toBeInTheDocument();
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
