import { useState } from 'react';
import type { PermissionItem, QuestionItem } from '../chatState';

type InteractionItem = QuestionItem | PermissionItem;

interface QuestionPermissionPanelProps {
  items: InteractionItem[];
  onAnswerQuestion: (question: QuestionItem, answer: string) => void | Promise<void>;
  onApprovePermission: (permission: PermissionItem) => void | Promise<void>;
  onDenyPermission: (permission: PermissionItem) => void | Promise<void>;
}

function isQuestion(item: InteractionItem): item is QuestionItem {
  return item.kind === 'question';
}

function isPermission(item: InteractionItem): item is PermissionItem {
  return item.kind === 'permission';
}

function QuestionCard({
  question,
  onAnswer,
}: {
  question: QuestionItem;
  onAnswer: (answer: string) => void | Promise<void>;
}) {
  const [answer, setAnswer] = useState('');

  return (
    <article className="message question">
      <header>
        <strong>question</strong>
        <span>{new Date(question.timestamp).toLocaleString()}</span>
      </header>
      <p>{question.question}</p>
      {question.options.length > 0 ? (
        <div className="interaction-options">
          {question.options.map((option) => (
            <button key={option} type="button" className="interaction-chip" onClick={() => void onAnswer(option)}>
              {option}
            </button>
          ))}
        </div>
      ) : null}
      <div className="interaction-response">
        <input
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Scrivi una risposta..."
          aria-label={`Risposta a ${question.questionId}`}
        />
        <button type="button" onClick={() => void onAnswer(answer.trim())} disabled={answer.trim().length === 0}>
          Invia
        </button>
      </div>
    </article>
  );
}

export default function QuestionPermissionPanel({
  items,
  onAnswerQuestion,
  onApprovePermission,
  onDenyPermission,
}: QuestionPermissionPanelProps) {
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
            <QuestionCard key={question.id} question={question} onAnswer={(answer) => onAnswerQuestion(question, answer)} />
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
              <div className="interaction-actions">
                <button type="button" onClick={() => void onApprovePermission(permission)}>
                  Approva
                </button>
                <button type="button" onClick={() => void onDenyPermission(permission)}>
                  Nega
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
