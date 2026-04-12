import { useState, useRef, useEffect } from 'react';
import type { ModelInfo } from '../types';

interface HeaderProps {
  cwdLabel: string;
  currentModel: string;
  queueInfo: { steering: number; followUp: number };
  connected: boolean;
  modelsLoaded: boolean;
  allModels: ModelInfo[];
  onToggleSidebar: () => void;
  onSelectModel: (provider: string, modelId: string) => void;
  onGetModels: () => void;
  onToggleLogs?: () => void;
}

export function Header({ cwdLabel, currentModel, queueInfo, connected, modelsLoaded, allModels, onToggleSidebar, onSelectModel, onGetModels, onToggleLogs }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (dropdownOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [dropdownOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allModels.length === 0) onGetModels();
    setSearchQuery('');
    setDropdownOpen(!dropdownOpen);
  };

  const handleSelect = (m: ModelInfo) => {
    onSelectModel(m.provider, m.id);
    setDropdownOpen(false);
    setSearchQuery('');
  };

  // Filter models by search query
  const filteredModels = searchQuery
    ? allModels.filter(m => {
        const q = searchQuery.toLowerCase();
        const label = `${m.provider}/${m.id}`.toLowerCase();
        return label.includes(q);
      })
    : allModels;

  // Group by provider for filtered results
  const grouped = filteredModels.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {} as Record<string, ModelInfo[]>);

  return (
    <header className="h-12 min-h-12 flex items-center px-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] gap-2.5 flex-shrink-0 relative z-50">
      <button
        onClick={onToggleSidebar}
        className="bg-none border-0 text-[var(--color-text-muted)] text-lg cursor-pointer p-1 rounded hover:bg-[var(--color-surface-2)]"
        title="Toggle sidebar"
      >
        ☰
      </button>

      <span className="font-mono text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] px-2.5 py-0.5 rounded border border-[var(--color-border)]">
        {cwdLabel}
      </span>

      {onToggleLogs && (
        <button
          onClick={onToggleLogs}
          className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          title="Show Server Logs"
        >
          📄 Logs
        </button>
      )}

      <span
        ref={buttonRef}
        className="text-xs text-[var(--color-cyan)] bg-[rgba(57,210,192,0.1)] px-2.5 py-0.5 rounded border border-[rgba(57,210,192,0.2)] ml-auto cursor-pointer hover:bg-[rgba(57,210,192,0.2)] select-none relative"
        onClick={handleClick}
      >
        {currentModel || 'no model'} <span className="text-[9px] ml-1">▼</span>

        {dropdownOpen && (
          <div
            ref={dropdownRef}
            className="fixed bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-500 min-w-[320px] max-h-[400px] flex flex-col"
            style={{ top: '52px', right: '16px' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="p-2 border-b border-[var(--color-border)]">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search models (e.g. minimax, opencode)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-1.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-cyan)]"
              />
            </div>

            {/* Model list */}
            <div className="overflow-y-auto flex-1 p-1 max-h-[340px]">
              {!modelsLoaded && allModels.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[var(--color-text-dim)]">
                  Loading models…
                </div>
              ) : filteredModels.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[var(--color-text-dim)]">
                  No models match "{searchQuery}"
                </div>
              ) : (
                Object.entries(grouped).map(([provider, providerModels]) => (
                  <div key={provider} className="mb-1">
                    <div className="px-3 py-1 text-[10px] uppercase text-[var(--color-text-dim)] font-semibold">
                      {provider} ({providerModels.length})
                    </div>
                    {providerModels.map(m => {
                      const supportsImages = m.input?.includes('image');
                      const contextSize = m.contextWindow ? (m.contextWindow / 1000000).toFixed(1) + 'M' : '?';
                      const maxOut = m.maxTokens ? (m.maxTokens / 1000).toFixed(0) + 'K' : '?';
                      return (
                        <div
                          key={`${m.provider}/${m.id}`}
                          className={`px-3 py-2 rounded-md cursor-pointer flex flex-col gap-1 text-xs
                            ${`${m.provider}/${m.id}` === currentModel ? 'bg-[var(--color-accent)] text-white' : 'hover:bg-[var(--color-surface-3)]'}`}
                          onClick={() => handleSelect(m)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{m.name || m.id}</span>
                            {m.reasoning && (
                              <span className={`text-[9px] px-1 py-0.5 rounded ${`${m.provider}/${m.id}` === currentModel ? 'bg-white/20' : 'bg-[var(--color-cyan)]/20 text-[var(--color-cyan)]'}`}>
                                🧠 reasoning
                              </span>
                            )}
                            <span className={`ml-auto text-[10px] ${`${m.provider}/${m.id}` === currentModel ? 'text-white/70' : 'text-[var(--color-text-dim)]'}`}>
                              {m.provider}
                            </span>
                          </div>
                          <div className={`flex gap-2 text-[10px] ${`${m.provider}/${m.id}` === currentModel ? 'text-white/60' : 'text-[var(--color-text-dim)]'}`}>
                            <span>📥 {supportsImages ? 'text+image' : 'text only'}</span>
                            <span>📚 {contextSize}</span>
                            <span>📤 max {maxOut}</span>
                            {m.cost && m.cost.input === 0 && m.cost.output === 0 && (
                              <span className="text-[var(--color-green)]">✓ free</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </span>

      {/* Queue info */}
      {(queueInfo.steering > 0 || queueInfo.followUp > 0) && (
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {queueInfo.steering > 0 && `⚡ ${queueInfo.steering} steer `}
          {queueInfo.followUp > 0 && `💬 ${queueInfo.followUp} follow-up`}
        </span>
      )}

      {/* Connection status */}
      {!connected && (
        <span className="text-[11px] text-[var(--color-red)]">● Disconnected</span>
      )}
    </header>
  );
}
