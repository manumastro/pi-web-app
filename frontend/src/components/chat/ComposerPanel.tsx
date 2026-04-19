import { ChevronDown, Maximize2, Plus, SendHorizontal, Settings2, Square, Star } from 'lucide-react';
import { useState, useEffect, type KeyboardEvent } from 'react';
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

interface ModelGroup {
  provider: string;
  models: ModelInfo[];
}

function groupModelsByProvider(models: ModelInfo[]): ModelGroup[] {
  const groups = new Map<string, ModelInfo[]>();
  for (const model of models) {
    const provider = model.provider ?? 'other';
    const list = groups.get(provider) ?? [];
    list.push(model);
    groups.set(provider, list);
  }
  return Array.from(groups.entries()).map(([provider, groupedModels]) => ({ provider, models: groupedModels }));
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
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('modelFavorites');
    if (saved) {
      try {
        setFavorites(new Set(JSON.parse(saved)));
      } catch { /* ignore */ }
    }
  }, []);
  
  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem('modelFavorites', JSON.stringify(Array.from(favorites)));
  }, [favorites]);
  
  const isStreaming = streaming === 'streaming';
  const isEmpty = prompt.trim().length === 0;

  // ALL models are selectable - like OpenChamber
  const allModels = models;
  const groups = groupModelsByProvider(allModels);
  
  // Filter by search query
  const filteredGroups = groups
    .map((group) => ({
      provider: group.provider,
      models: group.models.filter((model) =>
        model.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.key.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((group) => group.models.length > 0);
  
  const selectedModel = allModels.find((m) => m.key === activeModelKey);
  const selectedModelLabel = selectedModel?.label ?? 'Select model';

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isEmpty && !isStreaming) {
        void onSend();
      }
    }
  }
  
  function toggleFavorite(modelKey: string) {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(modelKey)) {
      newFavorites.delete(modelKey);
    } else {
      newFavorites.add(modelKey);
    }
    setFavorites(newFavorites);
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

            <div className="composer-model-wrap" style={{ position: 'relative' }}>
              <button
                type="button"
                className="composer-model-select"
                onClick={() => setShowModelPicker(!showModelPicker)}
                disabled={isStreaming}
                aria-label="Select model"
                title="Select model"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'inherit',
                }}
              >
                <span>{selectedModelLabel}</span>
                <ChevronDown size={12} />
              </button>
              
              {showModelPicker && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    width: '360px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.875rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 1000,
                    maxHeight: '400px',
                    overflow: 'auto',
                    marginBottom: '0.5rem',
                    padding: '0.75rem',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid var(--border)',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      marginBottom: '0.75rem',
                      background: 'var(--surface)',
                      color: 'var(--foreground)',
                    }}
                    autoFocus
                  />
                  
                  {filteredGroups.map((group) => (
                    <div key={group.provider} style={{ marginBottom: '0.75rem' }}>
                      <div
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color: 'var(--muted)',
                          marginBottom: '0.5rem',
                          paddingLeft: '0.5rem',
                        }}
                      >
                        {group.provider}
                      </div>
                      {group.models.map((model) => (
                        <div
                          key={model.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            background: model.key === activeModelKey ? 'var(--surface-2)' : 'transparent',
                            // All models selectable - no availability check
                          }}
                          onClick={() => {
                            // All models selectable - no availability check
                            onModelSelect(model.key);
                            setShowModelPicker(false);
                            setSearchQuery('');
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background =
                              model.key === activeModelKey ? 'var(--surface-2)' : 'transparent';
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(model.key);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              color: favorites.has(model.key) ? 'var(--warning)' : 'var(--muted)',
                            }}
                          >
                            <Star size={14} fill={favorites.has(model.key) ? 'currentColor' : 'none'} />
                          </button>
                          <span style={{ flex: 1, fontSize: '0.875rem' }}>{model.label}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
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
