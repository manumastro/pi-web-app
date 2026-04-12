import { useEffect, useRef, useState } from 'react';
import { renderMarkdown, highlightCodeBlocks } from '../utils/markdown';

// ── Types ──
export interface ToolCall {
  name: string;
  args: string;
  result?: string;
  isError?: boolean;
  isRunning: boolean;
  argsRaw: string;
}

export interface AssistantMessageState {
  thinking: string | null;
  thinkingFinished: boolean;
  text: string;
  toolCalls: ToolCall[];
}

export interface Message {
  type: 'user' | 'assistant' | 'system';
  text: string;
  images?: string[];
  assistantState?: AssistantMessageState;
  color?: string;
}

// ── User Message ──
export function UserMessage({ text, images }: { text: string; images?: string[] }) {
  return (
    <div className="self-end bg-[var(--color-user-bg)] border border-[#2a4a7f] rounded-[12px_12px_4px_12px] px-3.5 py-2.5 max-w-[90%] animate-fade-in leading-relaxed whitespace-pre-wrap text-sm">
      {text && <div>{text}</div>}
      {images?.map((src, i) => (
        <img key={i} src={src} alt="" className="max-w-[200px] max-h-[150px] rounded-lg mt-1.5" />
      ))}
    </div>
  );
}

// ── Typing Indicator ──
export function TypingIndicator() {
  return (
    <div className="self-start flex gap-1 px-4 py-3 animate-fade-in">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-[7px] h-[7px] rounded-full bg-[var(--color-text-muted)]"
          style={{ animation: `bounce 1.2s infinite ${i * 0.15}s` }} />
      ))}
    </div>
  );
}

// ── Thinking Block ──
export function ThinkingBlock({ text, finished }: { text: string; finished: boolean }) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div className="bg-[var(--color-thinking-bg)] border border-[var(--color-thinking-border)] rounded-lg mb-1.5 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-xs text-[var(--color-purple)] font-medium hover:bg-[rgba(124,92,191,0.1)] select-none"
        onClick={() => setCollapsed(!collapsed)}>
        <span className={`text-[10px] transition-transform ${collapsed ? '-rotate-90' : ''}`}>▼</span>
        🧠 {finished ? 'Thought process' : 'Thinking…'}
      </div>
      {!collapsed && (
        <div className="px-3 pb-2.5 text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap max-h-[350px] overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  );
}

// ── Tool Block ──
export function ToolBlock({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const isBash = tool.name === 'Bash' || tool.name === 'bash';
  
  // Show more for bash: 300 chars for args, full result
  const argsDisplay = isBash 
    ? (tool.argsRaw.length > 300 ? tool.argsRaw.slice(0, 300) + '…' : tool.argsRaw)
    : (tool.argsRaw.length > 80 ? tool.argsRaw.slice(0, 80) + '…' : tool.argsRaw);

  return (
    <div className="bg-[var(--color-tool-bg)] border border-[var(--color-tool-border)] rounded-md mb-1.5 overflow-hidden">
      {/* Tool header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--color-tool-border)] bg-[rgba(0,0,0,0.2)]">
        <span className="text-[var(--color-accent)] font-medium font-mono text-xs">{tool.name}</span>
        {tool.isRunning && (
          <div className="w-3 h-3 border-2 border-[var(--color-tool-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
        )}
        <span className="ml-auto text-[10px] text-[var(--color-text-dim)]">
          {tool.isRunning ? 'running...' : tool.isError ? 'error' : 'done'}
        </span>
      </div>
      
      {/* Input/Command (for bash, show more) */}
      {argsDisplay && (
        <div className="px-2.5 py-1.5 text-[11px] font-mono text-[var(--color-text-dim)] border-b border-[var(--color-tool-border)]">
          <span className="text-[var(--color-cyan)] opacity-70">$ </span>
          <span className="text-[var(--color-text-muted)]">{argsDisplay}</span>
        </div>
      )}
      
      {/* Output/Result */}
      {tool.result && (
        <div className="px-2.5 py-1.5 overflow-x-auto">
          {isBash ? (
            // For bash: show output in terminal style
            <pre className={`text-[11px] font-mono whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto ${tool.isError ? 'text-[var(--color-red)]' : 'text-[var(--color-text)]'}`}>
              {expanded ? tool.result : tool.result.slice(0, 500) + (tool.result.length > 500 ? '\n... (click to expand)' : '')}
            </pre>
          ) : (
            // For other tools: compact view
            <div 
              className="text-[11px] font-mono text-[var(--color-text-dim)] cursor-pointer hover:text-[var(--color-text)]"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? tool.result : tool.result.slice(0, 200) + (tool.result.length > 200 ? ' ...' : '')}
            </div>
          )}
          {tool.result.length > 500 && !expanded && (
            <button 
              className="text-[10px] text-[var(--color-cyan)] mt-1 hover:underline"
              onClick={() => setExpanded(true)}
            >
              Show more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── System Message ──
export function SystemMessage({ text, color }: { text: string; color?: string }) {
  return (
    <div className="self-stretch animate-fade-in" style={{ color: color || 'var(--color-orange)' }}>
      <div className="text-xs">{text}</div>
    </div>
  );
}

// ── Assistant Message ──
export function AssistantMessage({ state }: { state: AssistantMessageState }) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) highlightCodeBlocks(contentRef.current);
  }, [state.text]);

  return (
    <div className="self-start animate-fade-in">
      {state.thinking && (
        <ThinkingBlock text={state.thinking} finished={state.thinkingFinished} />
      )}
      {state.toolCalls.map((tool, i) => (
        <ToolBlock key={i} tool={tool} />
      ))}
      {state.text && (
        <div
          ref={contentRef}
          className="markdown-content"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(state.text) }}
        />
      )}
    </div>
  );
}

// ── Working Indicator ──
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function WorkingIndicator() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setFrame(f => (f + 1) % spinnerFrames.length), 80);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="self-start inline-flex items-center gap-2.5 px-3.5 py-1.5 bg-[var(--color-thinking-bg)] border border-[var(--color-thinking-border)] rounded-[10px] text-xs text-[var(--color-purple)]">
      <span>{spinnerFrames[frame]}</span>
      <span>Working…</span>
    </div>
  );
}

// ── Message List ──
export function MessageList({ messages, isWorking }: { messages: Message[]; isWorking: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isWorking]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 scroll-smooth min-h-0">
      {messages.map((msg, i) => {
        if (msg.type === 'user') return <UserMessage key={i} text={msg.text} images={msg.images} />;
        if (msg.type === 'system') return <SystemMessage key={i} text={msg.text} color={msg.color} />;
        if (msg.type === 'assistant' && msg.assistantState) {
          return <AssistantMessage key={i} state={msg.assistantState} />;
        }
        return null;
      })}
      {isWorking && <WorkingIndicator />}
    </div>
  );
}
