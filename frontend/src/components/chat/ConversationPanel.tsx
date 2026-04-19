import type { ConversationItem } from '@/chatState';

interface ConversationPanelProps {
  items: ConversationItem[];
  error?: string;
}

function formatTimestamp(timestamp: string): string {
  return timestamp === 'streaming'
    ? 'streaming'
    : new Date(timestamp).toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function roleLabel(role: string): string {
  return role === 'user' ? 'You' : role === 'assistant' ? 'Assistant' : role;
}

function SkeletonConversation() {
  return (
    <div className="conversation-empty" aria-hidden="true">
      <div className="conversation-skeleton">
        <div className="conversation-skeleton-row">
          <span className="conversation-skeleton-dot" />
          <span className="conversation-skeleton-line w-44" />
          <span className="conversation-skeleton-line w-64" />
        </div>
        <div className="conversation-skeleton-row">
          <span className="conversation-skeleton-dot" />
          <span className="conversation-skeleton-line w-28" />
          <span className="conversation-skeleton-line w-80" />
          <span className="conversation-skeleton-line w-72" />
        </div>
        <div className="conversation-skeleton-row">
          <span className="conversation-skeleton-dot" />
          <span className="conversation-skeleton-line w-36" />
          <span className="conversation-skeleton-line w-52" />
        </div>
      </div>
    </div>
  );
}

export function ConversationPanel({ items, error: errorMsg }: ConversationPanelProps) {
  return (
    <div className="messages-panel" role="log" aria-label="Conversation" aria-live="polite">
      {errorMsg && (
        <div className="message message-error" role="alert">
          <div className="message-header">
            <span className="message-role">Error</span>
          </div>
          <div className="message-content">{errorMsg}</div>
        </div>
      )}

      {items.length === 0 && !errorMsg && <SkeletonConversation />}

      {items.map((item) => {
        if (item.kind === 'message') {
          return (
            <article
              key={item.id}
              className={`message message-${item.role === 'user' ? 'user' : 'assistant'} ${
                item.status === 'streaming' ? 'streaming' : ''
              }`}
            >
              <div className="message-header">
                <span className="message-role">{roleLabel(item.role)}</span>
                <span className="message-time">{formatTimestamp(item.timestamp)}</span>
              </div>
              <div className="message-content">{item.content || (item.status === 'streaming' ? '…' : '—')}</div>
            </article>
          );
        }

        if (item.kind === 'thinking') {
          return (
            <details key={item.id} className="message message-thinking" open>
              <summary>
                <span className="message-badge thinking">
                  {item.done ? 'thinking complete' : 'thinking'}
                </span>
                <span className="message-time">{formatTimestamp(item.timestamp)}</span>
              </summary>
              <div className="message-content message-content-mono">{item.content || '…'}</div>
            </details>
          );
        }

        if (item.kind === 'tool_call') {
          return (
            <details key={item.id} className="message message-tool-call" open>
              <summary>
                <span className="message-badge">{item.toolName}</span>
                <span className="message-time">{formatTimestamp(item.timestamp)}</span>
              </summary>
              <pre className="message-code-block">{item.input}</pre>
            </details>
          );
        }

        if (item.kind === 'tool_result') {
          return (
            <details key={item.id} className={`message message-tool-result ${item.success ? 'success' : 'error'}`} open>
              <summary>
                <span className="message-badge">{item.success ? 'result' : 'error'}</span>
                <span className="message-time">{formatTimestamp(item.timestamp)}</span>
              </summary>
              <pre className="message-code-block">{item.result}</pre>
            </details>
          );
        }

        return null;
      })}
    </div>
  );
}

export default ConversationPanel;
