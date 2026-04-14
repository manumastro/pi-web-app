import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { useSSE } from './hooks/useSSE';

// Toggle between WebSocket and SSE - SSE is now the default
const USE_SSE = true; // Set to false to use WebSocket (deprecated)
import { useSessionStatusStore } from './stores/sessionStatusStore';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { FileTree } from './components/FileTree';
import { MessageList, type AssistantMessageState, type Message } from './components/Chat';
import { InputArea } from './components/InputArea';
import { RetryBanner } from './components/RetryBanner';
import type { WsEvent, SessionInfo, CwdInfo, ModelInfo, SessionStats } from './types';

const HOME = '/home/manu';

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
      <h2 className="text-[color-text)] font-normal text-[22px]">Pi Web — AI Coding Agent</h2>
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

// ── Message Cache ──
interface CachedMessages {
  sessionId: string;
  messages: Message[];
  timestamp: number;
}

const messageCache = new Map<string, CachedMessages>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Main App ──
export default function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // URL as source of truth
  const selectedCwd = searchParams.get('cwd') || '';
  const activeSessionId = searchParams.get('session');
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showFileTree, setShowFileTree] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState('/home/manu');
  const [cwds, setCwds] = useState<CwdInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const setStatus = useSessionStatusStore(s => s.setStatus);
  const setWorkingStartTime = useSessionStatusStore(s => s.setWorkingStartTime);
  const setRetryState = useSessionStatusStore(s => s.setRetryState);
  const retryState = useSessionStatusStore(s => s.retryState[activeSessionId || '']);
  const isBusy = useSessionStatusStore(s => s.getStatus(activeSessionId || '')) !== 'idle';
  const [currentModel, setCurrentModel] = useState('');
  const [queueInfo, setQueueInfo] = useState({ steering: 0, followUp: 0 });
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [allModels, setAllModels] = useState<ModelInfo[]>([]);
  const [serverLogs, setServerLogs] = useState<ServerLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // For streaming assistant message
  const currentAssistantRef = useRef<AssistantMessageState | null>(null);
  const msgIdxRef = useRef<number | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authToken = (import.meta as any).env?.VITE_AUTH_TOKEN || '';

  // Update URL helper
  const updateUrl = useCallback((cwd: string | null, sessionId: string | null) => {
    const newParams = new URLSearchParams();
    if (cwd) newParams.set('cwd', cwd);
    if (sessionId) newParams.set('session', sessionId);
    setSearchParams(newParams, { replace: true });
  }, [setSearchParams]);

  // Load initial CWDs
  useEffect(() => {
    fetch('/api/cwds')
      .then(r => r.json())
      .then((data: CwdInfo[]) => {
        // Ensure selectedCwd is in the list (even if 0 sessions)
        if (selectedCwd && !data.find(c => c.path === selectedCwd)) {
          const label = selectedCwd.replace(HOME, '~');
          data.unshift({ path: selectedCwd, label, sessionCount: 0 });
        }
        setCwds(data);
        // If no cwd in URL, use first available or default to home
        if (!selectedCwd) {
          if (data.length > 0) {
            updateUrl(data[0].path, null);
          } else {
            // No existing sessions - use home directory as default
            updateUrl('/home/manu', null);
          }
        }
      })
      .catch(() => {
        // Fallback to home directory on error
        if (!selectedCwd) {
          updateUrl('/home/manu', null);
        }
      });
  }, []);

  // Add selectedCwd to cwds if it changes and isn't in the list
  useEffect(() => {
    if (selectedCwd && !cwds.find(c => c.path === selectedCwd)) {
      const label = selectedCwd.replace(HOME, '~');
      setCwds(prev => [{ path: selectedCwd, label, sessionCount: 0 }, ...prev]);
    }
  }, [selectedCwd]);

  // Load sessions when CWD changes
  useEffect(() => {
    if (!selectedCwd) return;
    const url = `/api/sessions?cwd=${encodeURIComponent(selectedCwd)}&limit=200`;
    fetch(url).then(r => r.json()).then(data => {
      setSessions(data);
    }).catch(() => {});
  }, [selectedCwd]);

  // Lazy load messages only when session is selected
  useEffect(() => {
    if (!activeSessionId || !selectedCwd) {
      setMessages([]);
      setMessagesLoaded(false);
      return;
    }

    // Check cache first
    const cached = messageCache.get(activeSessionId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setMessages(cached.messages);
      setMessagesLoaded(true);
      return;
    }

    // Load from API
    setMessagesLoaded(false);
    fetch(`/api/sessions/${activeSessionId}`)
      .then(r => r.json())
      .then(data => {
        const newMessages: Message[] = [];
        if (data.messages) {
          for (const entry of data.messages) {
            if (entry.type === 'message' && entry.message) {
              const msg = entry.message;
              if (msg.role === 'user') {
                const text = extractMsgText(msg.content);
                const imgs = extractMsgImages(msg.content);
                if (text || imgs.length) {
                  newMessages.push({ type: 'user', text, images: imgs.length ? imgs : undefined });
                }
              } else if (msg.role === 'assistant') {
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
                  newMessages.push({ type: 'assistant', text: state.text, assistantState: state });
                }
              }
            }
          }
        }
        setMessages(newMessages);
        // Cache the messages
        messageCache.set(activeSessionId, { sessionId: activeSessionId, messages: newMessages, timestamp: Date.now() });
        setMessagesLoaded(true);
      })
      .catch(() => {
        setMessages([]);
        setMessagesLoaded(true);
      });
  }, [activeSessionId, selectedCwd]);

  // Handle incoming WebSocket events
  const handleEvent = useCallback((event: WsEvent) => {
    switch (event.type) {
      case 'state':
        // Restore session state
        if (event.model) {
          const provider = event.provider || '';
          setCurrentModel(provider ? `${provider}/${event.model}` : event.model);
        }
        
        // PRIORITÀ: Usa l'ID sessione inviato dal server, altrimenti usa quello dell'URL
        const targetSessionId = event.sessionId || activeSessionId || '';
        const status = event.isWorking ? 'working' : 'idle';
        
        console.log(`🔄 Syncing session state: [${targetSessionId}] -> ${status} (isWorking: ${event.isWorking})`);
        setStatus(targetSessionId, status);
        
        if (event.isWorking && event.workingDuration) {
          setWorkingStartTime(targetSessionId, Date.now() - event.workingDuration);
        } else if (!event.isWorking) {
          setWorkingStartTime(targetSessionId, null);
        }
        
        if (event.sessionId && event.sessionId !== activeSessionId) {
          // Sync URL with server session
          updateUrl(selectedCwd, event.sessionId);
        }
        break;

      case 'model_info':
        setCurrentModel(event.model);
        break;

      case 'thinking_start':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (!state) {
            // Check if last message is already an assistant message (from reconnection)
            const lastMsg = copy[copy.length - 1];
            if (lastMsg?.type === 'assistant') {
              state = lastMsg.assistantState || { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length - 1;
            } else {
              state = { thinking: '', thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length;
              copy.push({ type: 'assistant', text: '', assistantState: state });
            }
            currentAssistantRef.current = state;
          }
          state.thinking = '';
          state.thinkingFinished = false;
          if (msgIdxRef.current !== null) {
            copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
          }
          return copy;
        });
        break;

      case 'thinking_delta':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (!state) {
            // Check if last message is already an assistant message (from reconnection)
            const lastMsg = copy[copy.length - 1];
            if (lastMsg?.type === 'assistant') {
              state = lastMsg.assistantState || { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length - 1;
            } else {
              state = { thinking: '', thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length;
              copy.push({ type: 'assistant', text: '', assistantState: state });
            }
            currentAssistantRef.current = state;
          }
          state.thinking = (state.thinking || '') + event.text;
          if (msgIdxRef.current !== null) {
            copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
          }
          return copy;
        });
        break;

      case 'thinking_end':
        if (currentAssistantRef.current) {
          currentAssistantRef.current.thinkingFinished = true;
          setMessages(prev => {
            if (msgIdxRef.current === null) return prev;
            const copy = [...prev];
            copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...currentAssistantRef.current! } };
            return copy;
          });
        }
        break;

      case 'text_start':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (!state) {
            // Check if last message is already an assistant message (from reconnection)
            const lastMsg = copy[copy.length - 1];
            if (lastMsg?.type === 'assistant') {
              state = lastMsg.assistantState || { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length - 1;
            } else {
              state = { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length;
              copy.push({ type: 'assistant', text: '', assistantState: state });
            }
            currentAssistantRef.current = state;
          }
          state.text = '';
          if (msgIdxRef.current !== null) {
            copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
          }
          return copy;
        });
        break;

      case 'text_delta':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (!state) {
            // Check if last message is already an assistant message (from reconnection)
            const lastMsg = copy[copy.length - 1];
            if (lastMsg?.type === 'assistant') {
              state = lastMsg.assistantState || { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length - 1;
            } else {
              state = { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length;
              copy.push({ type: 'assistant', text: '', assistantState: state });
            }
            currentAssistantRef.current = state;
          }
          state.text += event.text;
          if (msgIdxRef.current !== null) {
            copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
          }
          return copy;
        });
        break;

      case 'text_end':
        if (currentAssistantRef.current) {
          // Finalize
        }
        currentAssistantRef.current = null;
        msgIdxRef.current = null;
        break;

      case 'toolcall_start':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (!state) {
            // Check if last message is already an assistant message (from reconnection)
            const lastMsg = copy[copy.length - 1];
            if (lastMsg?.type === 'assistant') {
              state = lastMsg.assistantState || { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length - 1;
            } else {
              state = { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length;
              copy.push({ type: 'assistant', text: '', assistantState: state });
            }
            currentAssistantRef.current = state;
          }
          state.toolCalls.push({ name: event.tool, args: '', argsRaw: '', isRunning: true });
          if (msgIdxRef.current !== null) {
            copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
          }
          return copy;
        });
        break;

      case 'toolcall_delta':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (state) {
            const last = state.toolCalls[state.toolCalls.length - 1];
            if (last) {
              last.argsRaw += event.text;
              last.args = last.argsRaw.slice(0, 80) + (last.argsRaw.length > 80 ? '…' : '');
            }
            if (msgIdxRef.current !== null) {
              copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
            }
          }
          return copy;
        });
        break;

      case 'toolcall_end':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (state) {
            const last = state.toolCalls[state.toolCalls.length - 1];
            if (last) {
              last.isRunning = false;
              if (event.tool) last.name = event.tool;
            }
            if (msgIdxRef.current !== null) {
              copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
            }
          }
          return copy;
        });
        break;

      case 'tool_exec_start':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (!state) {
            // Check if last message is already an assistant message (from reconnection)
            const lastMsg = copy[copy.length - 1];
            if (lastMsg?.type === 'assistant') {
              state = lastMsg.assistantState || { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length - 1;
            } else {
              state = { thinking: null, thinkingFinished: false, text: '', toolCalls: [] };
              msgIdxRef.current = copy.length;
              copy.push({ type: 'assistant', text: '', assistantState: state });
            }
            currentAssistantRef.current = state;
          }
          state.toolCalls.push({
            name: event.tool,
            args: event.args ? JSON.stringify(event.args).slice(0, 80) : '',
            argsRaw: event.args ? JSON.stringify(event.args) : '',
            isRunning: true,
            toolCallId: event.toolCallId,
          });
          if (msgIdxRef.current !== null) {
            copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
          }
          return copy;
        });
        break;

      case 'tool_exec_update':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (!state) {
            // Try to find existing assistant state from reconnected messages
            for (let i = copy.length - 1; i >= 0; i--) {
              if (copy[i].type === 'assistant' && copy[i].assistantState) {
                state = copy[i].assistantState!;
                msgIdxRef.current = i;
                currentAssistantRef.current = state;
                break;
              }
            }
          }
          if (state) {
            // Try to find tool call by toolCallId first, otherwise use last
            let targetToolCall: { name: string; args: string; argsRaw: string; result?: string; isRunning: boolean; isError?: boolean; toolCallId?: string } | undefined;
            if (event.toolCallId) {
              targetToolCall = state.toolCalls.find(tc => tc.toolCallId === event.toolCallId);
            }
            if (!targetToolCall) {
              targetToolCall = state.toolCalls[state.toolCalls.length - 1];
            }
            if (targetToolCall) {
              targetToolCall.result = (targetToolCall.result || '') + event.text;
            }
            if (msgIdxRef.current !== null) {
              copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
            }
          }
          return copy;
        });
        break;

      case 'tool_exec_end':
        setMessages(prev => {
          let copy = [...prev];
          let state = currentAssistantRef.current;
          if (!state) {
            // Try to find existing assistant state from reconnected messages
            for (let i = copy.length - 1; i >= 0; i--) {
              if (copy[i].type === 'assistant' && copy[i].assistantState) {
                state = copy[i].assistantState!;
                msgIdxRef.current = i;
                currentAssistantRef.current = state;
                break;
              }
            }
          }
          if (state) {
            // Try to find tool call by toolCallId first, otherwise use last
            let targetToolCall: { name: string; args: string; argsRaw: string; result?: string; isRunning: boolean; isError?: boolean; toolCallId?: string } | undefined;
            if (event.toolCallId) {
              targetToolCall = state.toolCalls.find(tc => tc.toolCallId === event.toolCallId);
            }
            if (!targetToolCall) {
              targetToolCall = state.toolCalls[state.toolCalls.length - 1];
            }
            if (targetToolCall) {
              targetToolCall.isRunning = false;
              targetToolCall.isError = event.isError;
              if (event.result?.content) {
                targetToolCall.result = event.result.content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join('')
                  .slice(0, 1000);
              }
            }
            if (msgIdxRef.current !== null) {
              copy[msgIdxRef.current] = { ...copy[msgIdxRef.current], assistantState: { ...state } };
            }
          }
          return copy;
        });
        break;

      case 'done':
        setStatus(activeSessionId || '', 'idle');
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
        setStatus(activeSessionId || '', 'idle');
        currentAssistantRef.current = null;
        msgIdxRef.current = null;
        setMessages(prev => [...prev, { type: 'system', text: `⚠️ ${event.message}`, color: 'var(--color-red)' }]);
        break;

      case 'rpc_error':
        if (event.command === 'set_model') {
          setMessages(prev => [...prev, { type: 'system', text: `⚠️ ${event.error}`, color: 'var(--color-red)' }]);
          setCurrentModel(prev => prev || '');
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

      case 'auto_retry_start': {
        const targetSessionId = activeSessionId || '';
        const nextRetryTime = Date.now() + event.delayMs;
        setRetryState(targetSessionId, {
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
          errorMessage: event.errorMessage,
          errorCategory: event.errorCategory,
          nextRetryTime,
        });
        setMessages(prev => [...prev, { type: 'system', text: `🔄 Auto-retry attempt ${event.attempt}/${event.maxAttempts}…`, color: 'orange' }]);
        break;
      }

      case 'auto_retry_end': {
        const targetSessionId = activeSessionId || '';
        setRetryState(targetSessionId, null);
        if (event.success) {
          setMessages(prev => [...prev, { type: 'system', text: `✅ Retry succeeded`, color: 'green' }]);
        } else {
          setMessages(prev => [...prev, { type: 'system', text: `❌ Retry failed: ${event.finalError || 'Unknown error'}`, color: 'red' }]);
        }
        break;
      }

      case 'queue_update':
        setQueueInfo({ steering: event.steering?.length || 0, followUp: event.followUp?.length || 0 });
        break;

      case 'rpc_response':
        if (event.command === 'get_available_models') {
          const models: ModelInfo[] = (event.data?.models || event.data || []).map((m: any) => ({
            id: m.id,
            name: m.name,
            provider: m.provider,
            reasoning: m.reasoning,
            input: m.input,
            contextWindow: m.contextWindow,
            maxTokens: m.maxTokens,
            cost: m.cost,
          }));
          setAllModels(models);
          setModelsLoaded(true);
        }
        if (event.command === 'get_session_stats') {
          const stats = event.data;
          if (stats) {
            setSessionStats({
              sessionId: stats.sessionId,
              sessionFile: stats.sessionFile,
              messages: stats.messages,
              model: stats.model,
              thinkingLevel: stats.thinkingLevel,
              inputTokens: stats.inputTokens || 0,
              outputTokens: stats.outputTokens || 0,
              totalTokens: stats.totalTokens || 0,
              tokensBefore: stats.tokensBefore || 0,
              contextUsage: stats.contextUsage || 0,
              contextWindow: stats.contextWindow || 0,
            });
          }
        }
        if (event.command === 'get_messages') {
          const inMemoryMessages = event.data?.messages;
          const isWorking = event.data?.isWorking;
          if (Array.isArray(inMemoryMessages)) {
            const newMessages: Message[] = [];
            for (const msg of inMemoryMessages) {
              if (msg.role === 'user') {
                const text = extractMsgText(msg.content);
                const imgs = extractMsgImages(msg.content);
                if (text || imgs.length) {
                  newMessages.push({ type: 'user', text, images: imgs.length ? imgs : undefined });
                }
              } else if (msg.role === 'assistant') {
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
                        isRunning: part.isRunning ?? false,
                        toolCallId: part.id,
                      });
                    } else if (part.type === 'text' && part.text) {
                      state.text += (state.text ? '\n' : '') + part.text;
                    }
                  }
                }
                if (state.text || state.thinking || state.toolCalls.length > 0) {
                  newMessages.push({ type: 'assistant', text: state.text, assistantState: state });
                }
              }
            }
            if (newMessages.length > 0) {
              setMessages(newMessages);
              setMessagesLoaded(true);
                if (isWorking !== undefined) {
                  setStatus(activeSessionId || '', isWorking ? 'working' : 'idle');
                }
            }
          }
        }
        break;

      case 'agent_start':
        setStatus(activeSessionId || '', 'working');
        break;

      case 'turn_start':
        // Update model when turn starts
        if (event.model) {
          setCurrentModel(event.model);
        }
        break;

      case 'turn_end':
        // Turn ended, nothing to do here
        break;

      case 'server_log':
        setServerLogs(logs => [...logs, { time: new Date(), level: event.level, message: event.message }].slice(-500));
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        break;

      case 'session_loaded':
        // Don't change messages on session_loaded - they're already in cache/URL
        break;

      case 'session_created':
        if (event.sessionId) {
          updateUrl(selectedCwd, event.sessionId);
        }
        break;

      case 'session_switched':
      case 'session_forked':
        if (event.sessionId) {
          updateUrl(selectedCwd, event.sessionId);
        }
        break;
    }
  }, [selectedCwd, activeSessionId, updateUrl]);

  // Use either WebSocket or SSE based on USE_SSE flag
  const wsHook = USE_SSE 
    ? useSSE({ cwd: selectedCwd || HOME, onEvent: handleEvent, onConnected: () => { setShowDisconnect(false); if (selectedCwd) { fetch(`/api/sessions?cwd=${encodeURIComponent(selectedCwd)}&limit=200`).then(r => r.json()).then(data => setSessions(data)).catch(() => {}); } if (selectedCwd) { /* models loaded via REST in handleEvent */ } if (selectedCwd && activeSessionId) { /* session loaded via SSE on connect */ } }, onDisconnected: () => setShowDisconnect(true), authToken })
    : useWebSocket({ onEvent: handleEvent, onConnected: () => { setShowDisconnect(false); if (selectedCwd) { fetch(`/api/sessions?cwd=${encodeURIComponent(selectedCwd)}&limit=200`).then(r => r.json()).then(data => setSessions(data)).catch(() => {}); } if (selectedCwd) { send({ type: 'get_available_models', cwd: selectedCwd }); } if (selectedCwd && activeSessionId) { send({ type: 'load_session', cwd: selectedCwd, sessionId: activeSessionId }); } send({ type: 'report_visibility', visible: true, activeSessionId: activeSessionId }); }, onDisconnected: () => setShowDisconnect(true), authToken });

  const { connected, send, reconnect } = wsHook;

  // Poll for state periodically to detect if agent is working
  // NOTE: no initial get_state here — load_session (sent from onConnected)
  // already provides the authoritative state including isWorking.
  // A premature get_state would return isWorking: false before the session
  // is loaded, overwriting the correct value.
  useEffect(() => {
    if (!connected || !selectedCwd) return;

    const pollInterval = setInterval(() => {
      send({ type: 'get_state', cwd: selectedCwd });
      send({ type: 'get_session_stats', cwd: selectedCwd });
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [connected, selectedCwd, send]);

  // Request session stats when active session changes
  useEffect(() => {
    if (connected && activeSessionId && selectedCwd) {
      send({ type: 'get_session_stats', cwd: selectedCwd });
    }
  }, [connected, activeSessionId, selectedCwd, send]);

  // Report visibility changes to server
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (connected) {
        send({
          type: 'report_visibility',
          visible: !document.hidden,
          activeSessionId: activeSessionId
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connected, activeSessionId, send]);

  // Send message
  const handleSend = useCallback((text: string, images?: string[]) => {
    if (!selectedCwd) return;

    // Keep existing session - don't clear URL
    // The session continues to work on the same session
    setStatus(activeSessionId || '', 'working');
    setMessages(prev => [...prev, { type: 'user', text, images }]);

    const cmd: any = { type: 'prompt', text, cwd: selectedCwd };
    if (images?.length) {
      cmd.images = images.map(src => {
        const match = src.match(/^data:(.*?);base64,(.*)$/);
        return match ? { type: 'image', data: match[2], mimeType: match[1] } : null;
      }).filter(Boolean);
    }
    send(cmd);
  }, [selectedCwd, send, updateUrl]);

  // Select CWD
  const handleSelectCwd = useCallback((cwd: string) => {
    updateUrl(cwd, null);
    setMessages([]);
    setMessagesLoaded(false);
    setSessionStats(null);
    currentAssistantRef.current = null;
    msgIdxRef.current = null;
    setCurrentModel('ready');
    setQueueInfo({ steering: 0, followUp: 0 });
  }, [updateUrl]);

  // Remove CWD from list
  const handleRemoveCwd = useCallback((cwd: string) => {
    setCwds(prev => prev.filter(c => c.path !== cwd));
    // If removing current cwd, switch to first available
    if (selectedCwd === cwd) {
      const remaining = cwds.filter(c => c.path !== cwd);
      if (remaining.length > 0) {
        handleSelectCwd(remaining[0].path);
      } else {
        updateUrl('/home/manu', null);
      }
    }
  }, [selectedCwd, cwds, handleSelectCwd, updateUrl]);

  // Load session
  const loadSession = useCallback(async (session: SessionInfo) => {
    updateUrl(session.cwd, session.id);
    setMessages([]);
    setMessagesLoaded(false);
    setSessionStats(null);
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
        const newMessages: Message[] = [];
        for (const entry of data.messages) {
          if (entry.type === 'message' && entry.message) {
            const msg = entry.message;
            if (msg.role === 'user') {
              const text = extractMsgText(msg.content);
              const imgs = extractMsgImages(msg.content);
              if (text || imgs.length) {
                newMessages.push({ type: 'user', text, images: imgs.length ? imgs : undefined });
              }
            } else if (msg.role === 'assistant') {
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
                newMessages.push({ type: 'assistant', text: state.text, assistantState: state });
              }
            }
          }
        }
        setMessages(newMessages);
        // Cache the messages
        messageCache.set(session.id, { sessionId: session.id, messages: newMessages, timestamp: Date.now() });
      }
      setMessagesLoaded(true);
    } catch (e) {
      console.error('Failed to load session:', e);
      setMessagesLoaded(true);
    }
  }, [send, updateUrl]);

  // New session
  const handleNewSession = useCallback(() => {
    if (!selectedCwd) return;
    send({ type: 'new_session', cwd: selectedCwd });
    updateUrl(selectedCwd, null);
    setMessages([]);
    setMessagesLoaded(true);
    setSessionStats(null);
    setStatus(activeSessionId || '', 'idle');
    currentAssistantRef.current = null;
    msgIdxRef.current = null;
    setCurrentModel('ready');
    setQueueInfo({ steering: 0, followUp: 0 });
  }, [selectedCwd, send, updateUrl]);

  // Delete session
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        // Remove from sessions list
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        // If deleted session was active, clear selection
        if (activeSessionId === sessionId) {
          updateUrl(selectedCwd, null);
          setMessages([]);
          setMessagesLoaded(false);
        }
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  }, [activeSessionId, selectedCwd, updateUrl]);

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

  // Determine what to show
  const showWelcome = !selectedCwd || (cwds.length > 0 && !activeSessionId && messages.length === 0 && !messagesLoaded);
  const showNoSession = selectedCwd && !activeSessionId && messages.length === 0 && messagesLoaded;

  return (
    <div className="flex flex-row h-full overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        cwds={cwds}
        sessions={sessions}
        selectedCwd={selectedCwd}
        activeSessionId={activeSessionId}
        connected={connected}
        onSelectCwd={(path) => {
          handleSelectCwd(path);
          setCurrentFilePath(path);
        }}
        onSelectSession={loadSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRemoveCwd={handleRemoveCwd}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* File Tree */}
      {showFileTree && selectedCwd && (
        <div className="w-[250px] min-w-[250px] border-r border-[var(--color-border)] flex flex-col">
          <FileTree
            initialPath={currentFilePath}
            selectedWorkspace={selectedCwd}
            onDirectoryChange={setCurrentFilePath}
            onSelectWorkspace={(path) => {
              updateUrl(path, null);
              setCurrentFilePath(path);
            }}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Toggle File Tree button in Header */}
        <Header
          cwdLabel={cwds.find(c => c.path === selectedCwd)?.label || '~'}
          currentModel={currentModel}
          queueInfo={queueInfo}
          connected={connected}
          modelsLoaded={modelsLoaded}
          allModels={allModels}
          sessionStats={sessionStats}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onSelectModel={handleSelectModel}
          onGetModels={handleGetModels}
          onToggleLogs={() => setShowLogs(!showLogs)}
          onToggleFileTree={() => setShowFileTree(!showFileTree)}
          showFileTree={showFileTree}
        />

        {/* Messages area */}
        {showWelcome ? (
          <div className="flex-1 overflow-hidden">
            <WelcomeScreen cwdCount={cwds.length} sessionCount={cwds.reduce((s, c) => s + c.sessionCount, 0)} />
          </div>
        ) : showNoSession ? (
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

        {retryState && (
          <RetryBanner
            attempt={retryState.attempt}
            maxAttempts={retryState.maxAttempts}
            delayMs={retryState.delayMs}
            errorMessage={retryState.errorMessage}
            errorCategory={retryState.errorCategory}
            nextRetryTime={retryState.nextRetryTime || Date.now() + retryState.delayMs}
          />
        )}

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