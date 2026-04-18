import type { ReactNode } from 'react';
import type { ConversationItem } from '../chatState';

interface ConversationPanelProps {
  conversation: ConversationItem[];
}

function formatTimestamp(timestamp: string): string {
  return timestamp === 'streaming' ? 'in streaming' : new Date(timestamp).toLocaleString();
}

function renderItem(item: ConversationItem): ReactNode {
  switch (item.kind) {
    case 'message':
      return (
        <article key={item.id} className={`message ${item.role} ${item.status ?? 'complete'}`}>
          <header>
            <strong>{item.role}</strong>
            <span>{formatTimestamp(item.timestamp)}</span>
          </header>
          <pre>{item.content || '...'}</pre>
        </article>
      );
    case 'thinking':
      return (
        <details key={item.id} className="message thinking" open={item.done}>
          <summary>
            <strong>thinking</strong>
            <span>{formatTimestamp(item.timestamp)}</span>
          </summary>
          <pre>{item.content || '...'}</pre>
        </details>
      );
    case 'tool_call':
      return (
        <article key={item.id} className="message tool-call">
          <header>
            <strong>tool · {item.toolName}</strong>
            <span>{formatTimestamp(item.timestamp)}</span>
          </header>
          <pre>{item.input}</pre>
        </article>
      );
    case 'tool_result':
      return (
        <article key={item.id} className={`message tool-result ${item.success ? 'success' : 'error'}`}>
          <header>
            <strong>result · {item.toolCallId}</strong>
            <span>{formatTimestamp(item.timestamp)}</span>
          </header>
          <pre>{item.result || '...'}</pre>
        </article>
      );
    case 'error':
      return (
        <article key={item.id} className="message error">
          <header>
            <strong>error · {item.category}</strong>
            <span>{formatTimestamp(item.timestamp)}</span>
          </header>
          <pre>{item.message}</pre>
        </article>
      );
    default:
      return null;
  }
}

export default function ConversationPanel({ conversation }: ConversationPanelProps) {
  return (
    <section className="panel messages-panel">
      <div className="panel-title">Conversazione</div>
      <div className="messages">
        {conversation.length === 0 ? <p className="muted">Nessun messaggio ancora.</p> : null}
        {conversation.map(renderItem)}
      </div>
    </section>
  );
}
