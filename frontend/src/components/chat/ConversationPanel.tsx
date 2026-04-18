import type { ConversationItem } from '@/chatState';

interface ConversationPanelProps {
  items: ConversationItem[];
  error?: string;
}

function formatTimestamp(ts: string): string {
  return ts === 'streaming'
    ? 'in streaming'
    : new Date(ts).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function roleLabel(role: string): string {
  return role === 'user' ? 'Tu' : role === 'assistant' ? 'Assistant' : role;
}

function badgeClass(kind: ConversationItem['kind']): string {
  const map: Record<string, string> = {
    message: 'message-badge',
    thinking: 'message-badge thinking',
    tool_call: 'message-badge',
    tool_result: 'message-badge',
    question: 'message-badge',
    permission: 'message-badge',
  };
  return map[kind] ?? 'message-badge';
}

export function ConversationPanel({ items, error: errorMsg }: ConversationPanelProps) {
  return (
    <div className="messages-panel" role="log" aria-label="Conversazione" aria-live="polite">
      {errorMsg && (
        <div className="message message-error" role="alert">
          <div className="message-header">
            <span className="message-role">Errore</span>
          </div>
          <div className="message-content">{errorMsg}</div>
        </div>
      )}

      {items.length === 0 && !errorMsg && (
        <div className="empty-state" style={{ minHeight: 'unset', padding: '3rem 1rem' }}>
          <p className="empty-state-title">Nessun messaggio</p>
          <p className="empty-state-subtitle">Inizia la conversazione scrivendo un prompt.</p>
        </div>
      )}

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
              <div className="message-content">
                {item.content || (item.status === 'streaming' ? '…' : '—')}
              </div>
            </article>
          );
        }

        if (item.kind === 'thinking') {
          return (
            <details key={item.id} className="message message-thinking" open={item.done}>
              <summary>
                <span className={badgeClass(item.kind)}>
                  {item.done ? '⏹ thinking · completato' : '◉ thinking · in corso'}
                </span>
                <span className="message-time">{formatTimestamp(item.timestamp)}</span>
              </summary>
              <div
                className="message-content"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code)' }}
              >
                {item.content || '…'}
              </div>
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
              <pre
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-code)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: '0.5rem 0 0',
                  color: 'var(--foreground)',
                }}
              >
                {item.input}
              </pre>
            </details>
          );
        }

        if (item.kind === 'tool_result') {
          return (
            <details
              key={item.id}
              className={`message message-tool-result ${item.success ? 'success' : 'error'}`}
              open
            >
              <summary>
                <span
                  className="message-badge"
                  style={item.success ? {} : { color: 'var(--destructive)' }}
                >
                  {item.success ? '✓ result' : '✗ error'}
                </span>
                <span className="message-time">{formatTimestamp(item.timestamp)}</span>
              </summary>
              <pre
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-code)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: '0.5rem 0 0',
                  color: item.success ? 'var(--foreground)' : 'var(--destructive)',
                }}
              >
                {item.result}
              </pre>
            </details>
          );
        }

        // permission and question are handled by separate panels
        return null;
      })}
    </div>
  );
}

export default ConversationPanel;
