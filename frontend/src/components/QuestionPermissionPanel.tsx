import type { ConversationItem } from '../chatState';

interface QuestionPermissionPanelProps {
  items: ConversationItem[];
}

function isQuestion(item: ConversationItem): item is Extract<ConversationItem, { kind: 'question' }> {
  return item.kind === 'question';
}

function isPermission(item: ConversationItem): item is Extract<ConversationItem, { kind: 'permission' }> {
  return item.kind === 'permission';
}

export default function QuestionPermissionPanel({ items }: QuestionPermissionPanelProps) {
  const questions = items.filter(isQuestion);
  const permissions = items.filter(isPermission);

  if (questions.length === 0 && permissions.length === 0) {
    return null;
  }

  return (
    <section className="panel interaction-panel">
      <div className="panel-title">Interazioni</div>

      {questions.length > 0 ? (
        <div className="interaction-group">
          <h3>Domande</h3>
          {questions.map((question) => (
            <article key={question.id} className="message question">
              <header>
                <strong>question</strong>
                <span>{new Date(question.timestamp).toLocaleString()}</span>
              </header>
              <p>{question.question}</p>
              {question.options.length > 0 ? (
                <ul>
                  {question.options.map((option) => (
                    <li key={option}>{option}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {permissions.length > 0 ? (
        <div className="interaction-group">
          <h3>Permessi</h3>
          {permissions.map((permission) => (
            <article key={permission.id} className="message permission">
              <header>
                <strong>permission</strong>
                <span>{new Date(permission.timestamp).toLocaleString()}</span>
              </header>
              <p>
                <strong>{permission.action}</strong> · {permission.resource}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
