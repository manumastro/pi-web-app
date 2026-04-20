import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Maximize2,
  Plus,
  Search,
  SendHorizontal,
  Settings2,
  Square,
  Star,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { ModelInfo, StreamingState } from '@/types';

interface ComposerPanelProps {
  prompt: string;
  streaming: StreamingState;
  models: ModelInfo[];
  activeModelKey: string;
  onPromptChange: (value: string) => void;
  onSend: () => Promise<void>;
  onAbort: () => Promise<void>;
  onModelSelect: (modelKey: string) => void;
}

type ModelSection = 'favorites' | 'recent' | 'provider';

type ModelGroup = {
  providerKey: string;
  providerLabel: string;
  models: ModelInfo[];
};

type FlatModelItem = {
  key: string;
  model: ModelInfo;
  providerKey: string;
  providerLabel: string;
  section: ModelSection;
};

const FAVORITES_STORAGE_KEY = 'pi-web-app:model-favorites';
const RECENTS_STORAGE_KEY = 'pi-web-app:model-recents';
const COLLAPSED_PROVIDERS_STORAGE_KEY = 'pi-web-app:model-collapsed-providers';
const MAX_RECENT_MODELS = 6;

function readStoredList(key: string): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeStoredList(key: string, values: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Ignore storage failures.
  }
}

function formatProviderLabel(providerKey: string | undefined): string {
  const value = providerKey?.trim();
  if (!value) {
    return 'Other';
  }

  return value
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getModelLabel(model: ModelInfo): string {
  return model.label?.trim() || model.key.split('/').pop() || model.key || 'Select model';
}

function normalizeSearchValue(value: string): { lower: string; compact: string; tokens: string[] } {
  const lower = value.toLowerCase().trim();
  return {
    lower,
    compact: lower.replace(/[^a-z0-9]/g, ''),
    tokens: lower.split(/[^a-z0-9]+/).filter(Boolean),
  };
}

function matchesModelSearch(candidate: string, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery.lower) {
    return true;
  }

  const normalizedCandidate = normalizeSearchValue(candidate);
  if (normalizedCandidate.lower.includes(normalizedQuery.lower)) {
    return true;
  }

  if (normalizedQuery.compact.length >= 2 && normalizedCandidate.compact.includes(normalizedQuery.compact)) {
    return true;
  }

  if (normalizedQuery.tokens.length === 0) {
    return false;
  }

  return normalizedQuery.tokens.every((queryToken) =>
    normalizedCandidate.tokens.some((candidateToken) =>
      candidateToken.startsWith(queryToken) || candidateToken.includes(queryToken),
    ),
  );
}

function groupModelsByProvider(models: ModelInfo[]): ModelGroup[] {
  const groups = new Map<string, ModelInfo[]>();

  for (const model of models) {
    const providerKey = model.provider?.trim() || 'other';
    const list = groups.get(providerKey) ?? [];
    list.push(model);
    groups.set(providerKey, list);
  }

  return Array.from(groups.entries())
    .map(([providerKey, providerModels]) => ({
      providerKey,
      providerLabel: formatProviderLabel(providerKey),
      models: providerModels.sort((left, right) => {
        const leftLabel = getModelLabel(left);
        const rightLabel = getModelLabel(right);
        return leftLabel.localeCompare(rightLabel) || left.key.localeCompare(right.key);
      }),
    }))
    .sort((left, right) => left.providerLabel.localeCompare(right.providerLabel) || left.providerKey.localeCompare(right.providerKey));
}

function filterModelGroup(group: ModelGroup, query: string): ModelGroup | null {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return group;
  }

  const providerMatches = matchesModelSearch(group.providerLabel, normalizedQuery) || matchesModelSearch(group.providerKey, normalizedQuery);
  const models = providerMatches
    ? group.models
    : group.models.filter((model) =>
        matchesModelSearch(getModelLabel(model), normalizedQuery)
        || matchesModelSearch(model.key, normalizedQuery)
        || matchesModelSearch(group.providerLabel, normalizedQuery),
      );

  if (models.length === 0) {
    return null;
  }

  return {
    ...group,
    models,
  };
}

export function ComposerPanel({
  prompt,
  streaming,
  models,
  activeModelKey,
  onPromptChange,
  onSend,
  onAbort,
  onModelSelect,
}: ComposerPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(readStoredList(FAVORITES_STORAGE_KEY)));
  const [recentModels, setRecentModels] = useState<string[]>(() => readStoredList(RECENTS_STORAGE_KEY));
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(() => new Set(readStoredList(COLLAPSED_PROVIDERS_STORAGE_KEY)));
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const isStreaming = streaming === 'streaming';
  const isEmpty = prompt.trim().length === 0;

  useEffect(() => {
    writeStoredList(FAVORITES_STORAGE_KEY, Array.from(favorites));
  }, [favorites]);

  useEffect(() => {
    writeStoredList(RECENTS_STORAGE_KEY, recentModels);
  }, [recentModels]);

  useEffect(() => {
    writeStoredList(COLLAPSED_PROVIDERS_STORAGE_KEY, Array.from(collapsedProviders));
  }, [collapsedProviders]);

  const providerGroups = useMemo(() => groupModelsByProvider(models), [models]);

  const filteredProviderGroups = useMemo(
    () => providerGroups.map((group) => filterModelGroup(group, searchQuery)).filter((group): group is ModelGroup => group !== null),
    [providerGroups, searchQuery],
  );

  const favoriteModels = useMemo(() => {
    const allowedKeys = new Set(models.map((model) => model.key));
    return Array.from(favorites)
      .filter((modelKey) => allowedKeys.has(modelKey))
      .map((modelKey) => models.find((model) => model.key === modelKey))
      .filter((model): model is ModelInfo => Boolean(model))
      .filter((model) => {
        const providerLabel = formatProviderLabel(model.provider);
        return matchesModelSearch(getModelLabel(model), searchQuery)
          || matchesModelSearch(model.key, searchQuery)
          || matchesModelSearch(providerLabel, searchQuery);
      });
  }, [favorites, models, searchQuery]);

  const recentModelItems = useMemo(() => {
    const allowedKeys = new Set(models.map((model) => model.key));
    const favoriteKeys = new Set(favorites);

    return recentModels
      .filter((modelKey) => allowedKeys.has(modelKey))
      .filter((modelKey) => !favoriteKeys.has(modelKey))
      .map((modelKey) => models.find((model) => model.key === modelKey))
      .filter((model): model is ModelInfo => Boolean(model))
      .filter((model) => {
        const providerLabel = formatProviderLabel(model.provider);
        return matchesModelSearch(getModelLabel(model), searchQuery)
          || matchesModelSearch(model.key, searchQuery)
          || matchesModelSearch(providerLabel, searchQuery);
      });
  }, [favorites, models, recentModels, searchQuery]);

  const flatModelItems = useMemo<FlatModelItem[]>(() => {
    const items: FlatModelItem[] = [];

    for (const model of favoriteModels) {
      items.push({
        key: `favorites:${model.key}`,
        model,
        providerKey: model.provider?.trim() || 'other',
        providerLabel: formatProviderLabel(model.provider),
        section: 'favorites',
      });
    }

    for (const model of recentModelItems) {
      items.push({
        key: `recent:${model.key}`,
        model,
        providerKey: model.provider?.trim() || 'other',
        providerLabel: formatProviderLabel(model.provider),
        section: 'recent',
      });
    }

    const forceExpandProviders = searchQuery.trim().length > 0;

    for (const group of filteredProviderGroups) {
      const isExpanded = forceExpandProviders || !collapsedProviders.has(group.providerKey);
      if (!isExpanded) {
        continue;
      }

      for (const model of group.models) {
        items.push({
          key: `provider:${group.providerKey}:${model.key}`,
          model,
          providerKey: group.providerKey,
          providerLabel: group.providerLabel,
          section: 'provider',
        });
      }
    }

    return items;
  }, [collapsedProviders, favoriteModels, filteredProviderGroups, recentModelItems, searchQuery]);

  const selectedModel = useMemo(
    () => models.find((model) => model.key === activeModelKey),
    [activeModelKey, models],
  );

  const selectedModelLabel = selectedModel?.label?.trim() || (activeModelKey ? activeModelKey.split('/').pop() || activeModelKey : 'Select model');
  const hasResults = favoriteModels.length > 0 || recentModelItems.length > 0 || filteredProviderGroups.length > 0;
  const forceExpandProviders = searchQuery.trim().length > 0;

  const recordRecentModel = useCallback((modelKey: string) => {
    setRecentModels((current) => {
      const next = [modelKey, ...current.filter((existing) => existing !== modelKey)];
      return next.slice(0, MAX_RECENT_MODELS);
    });
  }, []);

  const toggleFavorite = useCallback((modelKey: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(modelKey)) {
        next.delete(modelKey);
      } else {
        next.add(modelKey);
      }
      return next;
    });
  }, []);

  const toggleCollapsedProvider = useCallback((providerKey: string) => {
    setCollapsedProviders((current) => {
      const next = new Set(current);
      if (next.has(providerKey)) {
        next.delete(providerKey);
      } else {
        next.add(providerKey);
      }
      return next;
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setSearchQuery('');
    setHighlightedIndex(0);
  }, []);

  const scrollItemIntoView = useCallback((index: number) => {
    const item = itemRefs.current[index];
    if (item && typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const selectModel = useCallback((modelKey: string) => {
    onModelSelect(modelKey);
    recordRecentModel(modelKey);
    closeMenu();
  }, [closeMenu, onModelSelect, recordRecentModel]);

  useEffect(() => {
    if (!activeModelKey) {
      return;
    }

    if (models.some((model) => model.key === activeModelKey)) {
      recordRecentModel(activeModelKey);
    }
  }, [activeModelKey, models, recordRecentModel]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    if (flatModelItems.length === 0) {
      setHighlightedIndex(0);
      return;
    }

    if (highlightedIndex >= flatModelItems.length) {
      setHighlightedIndex(0);
    }
  }, [flatModelItems.length, highlightedIndex, menuOpen]);

  useEffect(() => {
    if (!menuOpen || flatModelItems.length === 0) {
      return;
    }

    scrollItemIntoView(highlightedIndex);
  }, [highlightedIndex, flatModelItems.length, menuOpen, scrollItemIntoView]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (menuPanelRef.current?.contains(target) || menuTriggerRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [closeMenu, menuOpen]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isEmpty && !isStreaming) {
        void onSend();
      }
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (flatModelItems.length === 0 && event.key !== 'Escape') {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (highlightedIndex + 1) % flatModelItems.length;
      setHighlightedIndex(nextIndex);
      window.setTimeout(() => {
        scrollItemIntoView(nextIndex);
      }, 0);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = (highlightedIndex - 1 + flatModelItems.length) % flatModelItems.length;
      setHighlightedIndex(nextIndex);
      window.setTimeout(() => {
        scrollItemIntoView(nextIndex);
      }, 0);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(0);
      window.setTimeout(() => {
        scrollItemIntoView(0);
      }, 0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const nextIndex = Math.max(0, flatModelItems.length - 1);
      setHighlightedIndex(nextIndex);
      window.setTimeout(() => {
        scrollItemIntoView(nextIndex);
      }, 0);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const highlightedItem = flatModelItems[highlightedIndex];
      if (highlightedItem) {
        selectModel(highlightedItem.model.key);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  }

  function renderModelRow(item: FlatModelItem, index: number) {
    const isSelected = item.model.key === activeModelKey;
    const isHighlighted = highlightedIndex === index;
    const isFavorite = favorites.has(item.model.key);
    const modelLabel = getModelLabel(item.model);

    return (
      <div
        key={item.key}
        ref={(element) => {
          itemRefs.current[index] = element;
        }}
        className={cn(
          'group flex items-stretch gap-1 rounded-lg transition-colors',
          isHighlighted ? 'bg-primary/10' : 'hover:bg-accent/70',
          isSelected ? 'ring-1 ring-primary/25' : '',
        )}
        onMouseEnter={() => setHighlightedIndex(index)}
      >
        <button
          type="button"
          aria-label={modelLabel}
          onClick={() => selectModel(item.model.key)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isSelected ? 'text-foreground' : 'text-foreground',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {modelLabel}
          </span>

          {item.section !== 'provider' ? (
            <span className="shrink-0 rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {item.providerLabel}
            </span>
          ) : null}

          {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
        </button>

        <button
          type="button"
          onClick={() => toggleFavorite(item.model.key)}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isFavorite ? 'text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <Star className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>
    );
  }

  return (
    <div className="composer-panel">
      <div className="composer-form">
        <textarea
          id="prompt-textarea"
          className="composer-textarea"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="@ for files/agents; / for commands; ! for shell"
          rows={4}
          disabled={isStreaming}
          aria-label="Prompt"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        <div className="composer-actions">
          <div className="composer-actions-left">
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Add attachment"
              title="Add attachment"
              onClick={() => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.multiple = true;
                fileInput.click();
              }}
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Toggle focus mode"
              title="Toggle focus mode"
              onClick={() => {
                document.documentElement.classList.toggle('focus-mode');
              }}
            >
              <Maximize2 size={16} />
            </button>
          </div>

          <div className="composer-actions-right">
            <button
              type="button"
              className="composer-preset"
              aria-label="Default preset"
              title="Default preset"
              onClick={() => {
                // Placeholder for preset selection
              }}
            >
              <Settings2 size={14} />
              <span>Default</span>
            </button>

            <div className="relative flex min-w-0">
              <button
                ref={menuTriggerRef}
                type="button"
                className={cn(
                  'inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-popover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                  'max-w-[min(240px,40vw)]',
                )}
                disabled={isStreaming}
                aria-label={selectedModelLabel}
                title="Select model"
                aria-expanded={menuOpen}
                onClick={() => {
                  if (menuOpen) {
                    closeMenu();
                    return;
                  }

                  setMenuOpen(true);
                  setSearchQuery('');
                  window.setTimeout(() => {
                    searchInputRef.current?.focus();
                  }, 0);
                }}
              >
                <span className="min-w-0 truncate text-left">
                  {selectedModelLabel}
                </span>
                <ChevronDown size={12} className="shrink-0 opacity-70" />
              </button>

              {menuOpen ? (
                <div
                  ref={menuPanelRef}
                  className="absolute bottom-full right-0 z-50 mb-2 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
                >
                  <div className="border-b border-border/60 p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search models"
                        value={searchQuery}
                        onChange={(event) => {
                          setSearchQuery(event.target.value);
                          setHighlightedIndex(0);
                        }}
                        onKeyDown={handleSearchKeyDown}
                        className="h-8 pl-8 text-sm"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        aria-label="Search models"
                      />
                    </div>
                  </div>

                  <div className="max-h-[min(400px,calc(100dvh-12rem))] overflow-y-auto overscroll-contain">
                    <div className="p-1">
                      {!hasResults ? (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No models found
                        </div>
                      ) : null}

                      {favoriteModels.length > 0 ? (
                        <div>
                          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            <Star className="h-3.5 w-3.5 fill-current text-primary" />
                            Favorites
                          </div>
                          <div className="flex flex-col gap-1">
                            {favoriteModels.map((model) => {
                              const item: FlatModelItem = {
                                key: `favorites:${model.key}`,
                                model,
                                providerKey: model.provider?.trim() || 'other',
                                providerLabel: formatProviderLabel(model.provider),
                                section: 'favorites',
                              };
                              const index = flatModelItems.findIndex((entry) => entry.key === item.key);
                              if (index === -1) {
                                return null;
                              }
                              return renderModelRow(item, index);
                            })}
                          </div>
                        </div>
                      ) : null}

                      {favoriteModels.length > 0 && recentModelItems.length > 0 ? <Separator className="my-2" /> : null}

                      {recentModelItems.length > 0 ? (
                        <div>
                          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" />
                            Recent
                          </div>
                          <div className="flex flex-col gap-1">
                            {recentModelItems.map((model) => {
                              const item: FlatModelItem = {
                                key: `recent:${model.key}`,
                                model,
                                providerKey: model.provider?.trim() || 'other',
                                providerLabel: formatProviderLabel(model.provider),
                                section: 'recent',
                              };
                              const index = flatModelItems.findIndex((entry) => entry.key === item.key);
                              if (index === -1) {
                                return null;
                              }
                              return renderModelRow(item, index);
                            })}
                          </div>
                        </div>
                      ) : null}

                      {(favoriteModels.length > 0 || recentModelItems.length > 0) && filteredProviderGroups.length > 0 ? (
                        <Separator className="my-2" />
                      ) : null}

                      <div className="flex flex-col gap-1">
                        {filteredProviderGroups.map((group) => {
                          const isExpanded = forceExpandProviders || !collapsedProviders.has(group.providerKey);

                          return (
                            <Collapsible key={group.providerKey} open={isExpanded}>
                              <div className="rounded-lg">
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    className={cn(
                                      'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors',
                                      forceExpandProviders ? 'cursor-default' : 'cursor-pointer hover:bg-accent/60',
                                    )}
                                    aria-expanded={isExpanded}
                                    aria-disabled={forceExpandProviders}
                                    disabled={forceExpandProviders}
                                    onClick={() => {
                                      if (!forceExpandProviders) {
                                        toggleCollapsedProvider(group.providerKey);
                                      }
                                    }}
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-[10px] font-medium text-muted-foreground">
                                        {group.providerLabel.slice(0, 1)}
                                      </span>
                                      <span className="truncate">{group.providerLabel}</span>
                                    </span>
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 shrink-0" />
                                    )}
                                  </button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-1">
                                  <div className="flex flex-col gap-1">
                                    {group.models.map((model) => {
                                      const item: FlatModelItem = {
                                        key: `provider:${group.providerKey}:${model.key}`,
                                        model,
                                        providerKey: group.providerKey,
                                        providerLabel: group.providerLabel,
                                        section: 'provider',
                                      };
                                      const index = flatModelItems.findIndex((entry) => entry.key === item.key);
                                      if (index === -1) {
                                        return null;
                                      }
                                      return renderModelRow(item, index);
                                    })}
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <span className="composer-build-chip">Build</span>

            {isStreaming ? (
              <button
                type="button"
                className="composer-send-button"
                onClick={() => void onAbort()}
                aria-label="Stop"
                title="Stop"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="composer-send-button"
                onClick={() => void onSend()}
                disabled={isEmpty}
                aria-label="Send"
                title="Send"
              >
                <SendHorizontal size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComposerPanel;
