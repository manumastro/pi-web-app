import type { ConversationItem } from '../chatState';

interface ConversationPanelProps {
  conversation: ConversationItem[];
}

function formatTimestamp(timestamp: string): string {
  return timestamp === 'streaming' ? 'in streaming' : new Date(timestamp).toLocaleString();
}

function badgeClass(kind: ConversationItem['kind'], state?: string): string {
  if (kind === 'message') {
    return state ? `message-badge ${state}` : 'message-badge';
  }
  if (kind === 'question' || kind === 'permission') {
    return `message-badge ${kind}`;
  }
  return `message-badge ${kind}`;
}

export default function ConversationPanel({ conversation }: ConversationPanelProps) {
  return (
    <section className="panel messages-panel">
      <div className="panel-title">Conversazione</div>
      <div className="messages">
        {conversation.length === 0 ? <p className="muted">Nessun messaggio ancora.</p> : null}

        {conversation.map((item) => {
          if (item.kind === 'message') {
            return (
              <article key={item.id} className={`message ${item.role} ${item.status ?? 'complete'}`}>
                <header>
                  <span className={badgeClass(item.kind, item.status)}>{item.role}</span>
                  <span className="message-timestamp">{formatTimestamp(item.timestamp)}</span>
                </header>
                <pre>{item.content || '...'}</pre>
              </article>
            );
          }

          if (item.kind === 'thinking') {
            return (
              <details key={item.id} className="message thinking" open={item.done}>
                <summary>
                  <span className={badgeClass(item.kind)}>{item.done ? 'thinking · done' : 'thinking · live'}</span>
                  <span className="message-timestamp">{formatTimestamp(item.timestamp)}</span>
                </summary>
                <pre>{item.content || '...'}</pre>
              </details>
            );
          }

          if (item.kind === 'question') {
            return (
              <details key={item.id} className="message question" open>
                <summary>
                  <span className={badgeClass(item.kind)}>question</span>
                  <span className="message-timestamp">{formatTimestamp(item.timestamp)}</span>
                </summary>
                <p>{item.question}</p>
                {item.options.length > 0 ? (
                  <ul>
                    {item.options.map((option) => (
                      <li key={option}>{option}</li>
                    ))}
                  </ul>
                ) : null}
              </details>
            );
          }

          if (item.kind === 'permission') {
            return (
              <article key={item.id} className="message permission">
                <header>
                  <span className={badgeClass(item.kind)}>permission</span>
                  <span className="message-timestamp">{formatTimestamp(item.timestamp)}</span>
                </header>
                <p>
                  <strong>{item.action}</strong> · {item.resource}
                </p>
              </article>
            );
          }

          if (item.kind === 'tool_call') {
            return (
              <details key={item.id} className="message tool-call" open>
                <summary>
                  <span className={badgeClass(item.kind)}>{item.toolName}</span>
                  <span className="message-timestamp">{formatTimestamp(item.timestamp)}</span>
                </summary>
                <pre>{item.input}</pre>
              </details>
            );
          }

          if (item.kind === 'tool_result') {
            return (
              <details key={item.id} className={`message tool-result ${item.success ? 'success' : 'error'}`} open>
                <summary>
                  <span className={badgeClass(item.kind, item.success ? 'success' : 'error')}>
                    {item.success ? 'tool result' : 'tool error'}
                  </span>
                  <span className="message-timestamp">{formatTimestamp(item.timestamp)}</span>
                </summary>
                <pre>{item.result || '...'}</pre>
              </details>
            );
          }

          return (
            <article key={item.id} className="message error">
              <header>
                <span className={badgeClass(item.kind, item.recoverable ? 'recoverable' : 'fatal')}>
                  {item.category}
                </span>
                <span className="message-timestamp">{formatTimestamp(item.timestamp)}</span>
              </header>
              <pre>{item.message}</pre>
            </article>
          );
        })}
      </div>
    </section>
  );
}
