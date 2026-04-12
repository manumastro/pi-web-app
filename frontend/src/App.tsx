import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MessageList, type AssistantMessageState, type Message } from './components/Chat';
import { InputArea } from './components/InputArea';
import type { WsEvent, SessionInfo, CwdInfo } from './types';



// ── Helpers ──
function extractMsgText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((c: any) => c?.type === 'text').map((c: any) => c.text || '').join('\n');
  }
  return '';
}

function extractMsgImages(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((c: any) => c?.type === 'image' && c.data)
    .map((c: any) => `data:${c.mimeType || 'image/png'};base64,${c.data}`);
}

// ── Welcome Screen ──
function WelcomeScreen({ cwdCount, sessionCount }: { cwdCount: number; sessionCount: number }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] text-center gap-3">
      <div className="text-[56px] mb-1">🥧</div>
      <h2 className="text-[var(--color-text)] font-normal text-[22px]">Pi Web — AI Coding Agent</h2>
      <p className="text-sm max-w-[450px] leading-relaxed">
        Full access to all your sessions across every project directory. Chat, code, debug — right from the browser.
      </p>
      <div className="flex gap-6 mt-2">
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--color-accent)]">{cwdCount}</div>
          <div className="text-[11px] uppercase tracking-wider">Directories</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--color-accent)]">{sessionCount}</div>
          <div className="text-[11px] uppercase tracking-wider">Sessions</div>
        </div>
      </div>
    </div>
  );
}

function NoSessionScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] text-center gap-3">
      <div className="text-[56px] mb-1">📋</div>
      <h2 className="text-[var(--color-text)] font-normal text-[22px]">Select or create a session</h2>
      <p className="text-sm">
        Choose an existing session from the sidebar or click <strong className="text-[var(--color-text)]">+ New</strong> to start fresh.
      </p>
    </div>
  );
}

function DisconnectBanner() {
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 bg-[#3d1f1f] border border-[var(--color-red)] text-[#ffa198] px-4.5 py-2 rounded-lg text-sm z-[1000] flex items-center gap-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
      <span>🔴 Connection lost — reconnecting…</span>
    </div>
  );
}

interface ServerLog {
  time: Date;
  level: 'info' | 'error';
  message: string;
}

// ── Main App ──
export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth > 768 ? false : true);
  const [cwds, setCwds] = useState<CwdInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedCwd, setSelectedCwd] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [currentModel, setCurrentModel] = useState('');
  const [queueInfo, setQueueInfo] = useState({ steering: 0, followUp: 0 });
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [allModels, setAllModels] = useState<any[]>([]);
  const [serverLogs, setServerLogs] = useState<ServerLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // For streaming assistant message
  const currentAssistantRef = useRef<AssistantMessageState | null>(null);
  const msgIdxRef = useRef<number | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authToken = (import.meta as any).env?.VITE_AUTH_TOKEN || '';

  // Load initial data
  useEffect(() => {
    fetch('/api/cwds')
      .then(r => r.json())
      .then((data: CwdInfo[]) => {
        setCwds(data);
        if (data && data.length > 0) {
          setSelectedCwd(data[0].path);
        }
      })
      .catch(() => {});
  }, []);

  // Load sessions when CWD changes
  useEffect(() => {
    if (!selectedCwd) return;
    const url = `/api/sessions?cwd=${encodeURIComponent(selectedCwd)}&limit=200`;
    fetch(url).then(r => r.json()).then(data => {
      setSessions(data);
    }).catch(() => {});
  }, [selectedCwd]);

  // Handle incoming WebSocket events
  const handleEvent = useCallback((event: WsEvent) => {
    switch (event.type) {
      case 'model_info':
        setCurrentModel(event.model);
        break;

      case 'thinking_start':
        if (!currentAssistantRef.current) {
          const state: AssistantMessageState = { thinking: '', thinkingFinished: false, text: '', toolCalls: [] };
          currentAssistantRef.current = state;
          const idx = messages.length;
          msgIdxRef.current = idx;
          setMessages(prev => [...prev, { type: 'assistant', text: '', assistantState: state }]);
        }
        currentAssistantRef.current.thinking = '';
        currentAssistantRef.current.thinkingFinished = false;
        break;

      case 'thinking_delta':
        if (currentAssistantRef.current) {
          currentAssistantRef.current.thinking = (currentAssistantRef.current.thinking || '') + event.text;
          setMessages(prev => {
            if (msgIdxRef.current === null) return prev;
            const copy = [...prev];
            copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...currentAssistantRef.current! } };
            return copy;
          });
        }
        break;

      case 'thinking_end':
        if (currentAssistantRef.current) {
          currentAssistantRef.current.thinkingFinished = true;
        }
        break;

      case 'text_start':
        if (!currentAssistantRef.current) {
          const state: AssistantMessageState = { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
          currentAssistantRef.current = state;
          const idx = messages.length;
          msgIdxRef.current = idx;
          setMessages(prev => [...prev, { type: 'assistant', text: '', assistantState: state }]);
        }
        currentAssistantRef.current.text = '';
        break;

      case 'text_delta':
        if (currentAssistantRef.current) {
          currentAssistantRef.current.text += event.text;
          setMessages(prev => {
            if (msgIdxRef.current === null) return prev;
            const copy = [...prev];
            copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...currentAssistantRef.current! } };
            return copy;
          });
        }
        break;

      case 'text_end':
        if (currentAssistantRef.current) {
          // Finalize
        }
        currentAssistantRef.current = null;
        msgIdxRef.current = null;
        break;

      case 'toolcall_start':
        if (!currentAssistantRef.current) {
          const state: AssistantMessageState = { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
          currentAssistantRef.current = state;
          const idx = messages.length;
          msgIdxRef.current = idx;
          setMessages(prev => [...prev, { type: 'assistant', text: '', assistantState: state }]);
        }
        currentAssistantRef.current.toolCalls.push({
          name: event.tool,
          args: '',
          argsRaw: '',
          isRunning: true,
        });
        break;

      case 'toolcall_delta':
        if (currentAssistantRef.current) {
          const last = currentAssistantRef.current.toolCalls[currentAssistantRef.current.toolCalls.length - 1];
          if (last) {
            last.argsRaw += event.text;
            last.args = last.argsRaw.slice(0, 80) + (last.argsRaw.length > 80 ? '…' : '');
          }
        }
        break;

      case 'toolcall_end':
        if (currentAssistantRef.current) {
          const last = currentAssistantRef.current.toolCalls[currentAssistantRef.current.toolCalls.length - 1];
          if (last) {
            last.isRunning = false;
            if (event.tool) last.name = event.tool;
          }
        }
        break;

      case 'tool_exec_start':
        if (!currentAssistantRef.current) {
          const state: AssistantMessageState = { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
          currentAssistantRef.current = state;
          const idx = messages.length;
          msgIdxRef.current = idx;
          setMessages(prev => [...prev, { type: 'assistant', text: '', assistantState: state }]);
        }
        currentAssistantRef.current.toolCalls.push({
          name: event.tool,
          args: event.args ? JSON.stringify(event.args).slice(0, 80) : '',
          argsRaw: event.args ? JSON.stringify(event.args) : '',
          isRunning: true,
        });
        break;

      case 'tool_exec_update':
        if (currentAssistantRef.current) {
          const last = currentAssistantRef.current.toolCalls[currentAssistantRef.current.toolCalls.length - 1];
          if (last) {
            last.result = (last.result || '') + event.text;
          }
        }
        break;

      case 'tool_exec_end':
        if (currentAssistantRef.current) {
          const last = currentAssistantRef.current.toolCalls[currentAssistantRef.current.toolCalls.length - 1];
          if (last) {
            last.isRunning = false;
            last.isError = event.isError;
            if (event.result?.content) {
              last.result = event.result.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('')
                .slice(0, 200);
            }
          }
        }
        break;

      case 'done':
        setIsBusy(false);
        currentAssistantRef.current = null;
        msgIdxRef.current = null;
        // Reload sessions
        if (selectedCwd) {
          fetch(`/api/sessions?cwd=${encodeURIComponent(selectedCwd)}&limit=200`)
            .then(r => r.json())
            .then(data => setSessions(data))
            .catch(() => {});
        }
        break;

      case 'error':
        setIsBusy(false);
        currentAssistantRef.current = null;
        msgIdxRef.current = null;
        setMessages(prev => [...prev, { type: 'system', text: `⚠️ ${event.message}`, color: 'var(--color-red)' }]);
        break;

      case 'rpc_error':
        if (event.command === 'set_model') {
          // Show model selection error as a toast-like message
          setMessages(prev => [...prev, { type: 'system', text: `⚠️ ${event.error}`, color: 'var(--color-red)' }]);
          setCurrentModel(prev => prev || ''); // keep previous
        } else {
          setMessages(prev => [...prev, { type: 'system', text: `RPC error [${event.command}]: ${event.error}`, color: 'var(--color-red)' }]);
        }
        break;

      case 'rpc_info':
        setMessages(prev => [...prev, { type: 'system', text: `ℹ️ ${event.message}`, color: 'var(--color-orange)' }]);
        break;

      case 'compaction_start':
        setMessages(prev => [...prev, { type: 'system', text: `⏳ Compacting context (${event.reason})…` }]);
        break;

      case 'compaction_end':
        if (event.summary) setMessages(prev => [...prev, { type: 'system', text: `✅ Context compacted` }]);
        break;

      case 'auto_retry_start':
        setMessages(prev => [...prev, { type: 'system', text: `🔄 Auto-retry attempt ${event.attempt}/${event.maxAttempts}…` }]);
        break;

      case 'auto_retry_end':
        if (event.success) setMessages(prev => [...prev, { type: 'system', text: `✅ Retry succeeded` }]);
        else setMessages(prev => [...prev, { type: 'system', text: `❌ Retry failed: ${event.finalError || ''}` }]);
        break;

      case 'queue_update':
        setQueueInfo({ steering: event.steering?.length || 0, followUp: event.followUp?.length || 0 });
        break;

      case 'agent_start':
        break;

      case 'agent_end':
        break;

      case 'rpc_response':
        if (event.command === 'get_available_models') {
          const models = event.data?.models || event.data || [];
          setAllModels(models);
          setModelsLoaded(true);
        }
        break;

      case 'server_log':
        setServerLogs(logs => [...logs, { time: new Date(), level: event.level, message: event.message }].slice(-500));
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        break;
    }
  }, [selectedCwd, messages.length]);

  const { connected, send } = useWebSocket({
    onEvent: handleEvent,
    onConnected: () => setShowDisconnect(false),
    onDisconnected: () => {
      setShowDisconnect(true);
      setIsBusy(false);
      currentAssistantRef.current = null;
      msgIdxRef.current = null;
    },
    authToken,
  });

  // Fetch available models when connected and cwd is selected
  useEffect(() => {
    if (!connected || !selectedCwd) return;
    setModelsLoaded(false);
    send({ type: 'get_available_models', cwd: selectedCwd });
  }, [connected, selectedCwd, send]);

  // Send message
  const handleSend = useCallback((text: string, images?: string[]) => {
    if (!selectedCwd) return;

    setActiveSessionId(null);
    setIsBusy(true);
    setMessages(prev => [...prev, { type: 'user', text, images }]);

    const cmd: any = { type: 'prompt', text, cwd: selectedCwd };
    if (images?.length) {
      cmd.images = images.map(src => {
        const match = src.match(/^data:(.*?);base64,(.*)$/);
        return match ? { type: 'image', data: match[2], mimeType: match[1] } : null;
      }).filter(Boolean);
    }
    send(cmd);
  }, [selectedCwd, send]);

  // Load session
  const loadSession = useCallback(async (session: SessionInfo) => {
    setActiveSessionId(session.id);
    setSelectedCwd(session.cwd);
    setMessages([]);
    currentAssistantRef.current = null;
    msgIdxRef.current = null;

    // Tell backend to switch
    send({ type: 'load_session', cwd: session.cwd, sessionId: session.id });
    send({ type: 'get_available_models', cwd: session.cwd });

    try {
      const res = await fetch(`/api/sessions/${session.id}`);
      const data = await res.json();

      if (data.model) setCurrentModel(data.model);

      if (data.messages) {
        for (const entry of data.messages) {
          if (entry.type === 'message' && entry.message) {
            const msg = entry.message;
            if (msg.role === 'user') {
              const text = extractMsgText(msg.content);
              const imgs = extractMsgImages(msg.content);
              if (text || imgs.length) {
                setMessages(prev => [...prev, { type: 'user', text, images: imgs.length ? imgs : undefined }]);
              }
            } else if (msg.role === 'assistant') {
              // Reconstruct assistant state from history
              const state: AssistantMessageState = {
                thinking: null,
                thinkingFinished: false,
                text: '',
                toolCalls: [],
              };

              const content = msg.content;
              if (typeof content === 'string') {
                state.text = content;
              } else if (Array.isArray(content)) {
                for (const part of content) {
                  if (part.type === 'thinking' && part.thinking) {
                    state.thinking = part.thinking;
                    state.thinkingFinished = true;
                  } else if (part.type === 'toolCall') {
                    state.toolCalls.push({
                      name: part.name || 'unknown',
                      args: part.arguments ? JSON.stringify(part.arguments).slice(0, 80) : '',
                      argsRaw: part.arguments ? JSON.stringify(part.arguments) : '',
                      isRunning: false,
                    });
                  } else if (part.type === 'text' && part.text) {
                    state.text += (state.text ? '\n' : '') + part.text;
                  }
                }
              }

              if (state.text || state.thinking || state.toolCalls.length > 0) {
                setMessages(prev => [...prev, { type: 'assistant', text: state.text, assistantState: state }]);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    }
  }, [send]);

  // New session
  const handleNewSession = useCallback(() => {
    if (!selectedCwd) return;
    send({ type: 'new_session', cwd: selectedCwd });
    setActiveSessionId(null);
    setMessages([]);
    setIsBusy(false);
    currentAssistantRef.current = null;
    msgIdxRef.current = null;
    setCurrentModel('ready');
    setQueueInfo({ steering: 0, followUp: 0 });
  }, [selectedCwd, send]);

  // Select model
  const handleSelectModel = useCallback((provider: string, modelId: string) => {
    if (!selectedCwd) return;
    send({ type: 'set_model', cwd: selectedCwd, provider, modelId });
    setCurrentModel(`${provider}/${modelId}`);
  }, [selectedCwd, send]);

  // Get available models
  const handleGetModels = useCallback(() => {
    if (!selectedCwd) return;
    send({ type: 'get_available_models', cwd: selectedCwd });
  }, [selectedCwd, send]);

  // Stop current agent action
  const handleStop = useCallback(() => {
    if (!selectedCwd) return;
    send({ type: 'abort', cwd: selectedCwd });
  }, [selectedCwd, send]);

  return (
    <div className="flex flex-row h-full overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        cwds={cwds}
        sessions={sessions}
        selectedCwd={selectedCwd}
        activeSessionId={activeSessionId}
        connected={connected}
        onSelectCwd={(cwd) => { setSelectedCwd(cwd); }}
        onSelectSession={loadSession}
        onNewSession={handleNewSession}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          cwdLabel={cwds.find(c => c.path === selectedCwd)?.label || '~'}
          currentModel={currentModel}
          queueInfo={queueInfo}
          connected={connected}
          modelsLoaded={modelsLoaded}
          allModels={allModels}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onSelectModel={handleSelectModel}
          onGetModels={handleGetModels}
          onToggleLogs={() => setShowLogs(!showLogs)}
        />

        {/* Messages area */}
        {messages.length === 0 && !activeSessionId ? (
          <div className="flex-1 overflow-hidden">
            <WelcomeScreen cwdCount={cwds.length} sessionCount={cwds.reduce((s, c) => s + c.sessionCount, 0)} />
          </div>
        ) : messages.length === 0 && activeSessionId ? (
          <div className="flex-1 overflow-hidden">
            <NoSessionScreen />
          </div>
        ) : (
          <MessageList messages={messages} isWorking={isBusy} />
        )}

        {showLogs && (
          <div className="h-[250px] border-b border-[var(--color-border)] bg-[var(--color-bg)] flex flex-col font-mono text-[11px] flex-shrink-0 relative">
            <div className="flex items-center justify-between px-3 py-1 bg-[var(--color-surface-2)] border-b border-[var(--color-border)] text-[var(--color-text-dim)]">
              <span>Server Logs (systemd)</span>
              <button onClick={() => setShowLogs(false)} className="hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {serverLogs.map((log, i) => (
                <div key={i} className={log.level === 'error' ? 'text-[var(--color-red)]' : 'text-[var(--color-text-muted)]'}>
                  <span className="opacity-50 mr-2">[{log.time.toLocaleTimeString()}]</span>
                  {log.message}
                </div>
              ))}
              {serverLogs.length === 0 && <div className="text-[var(--color-text-dim)] italic">Waiting for logs...</div>}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {showDisconnect && <DisconnectBanner />}

        <InputArea
          onSend={handleSend}
          onStop={handleStop}
          isBusy={isBusy}
          disabled={!connected || isBusy || !selectedCwd}
        />
      </div>
    </div>
  );
}
