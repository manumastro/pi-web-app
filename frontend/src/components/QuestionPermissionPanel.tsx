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
    <article className="interaction-panel" style={{ marginBottom: '0.5rem' }}>
      <div className="interaction-panel-header">
        <span className="interaction-panel-title" style={{ color: 'var(--accent-hover)' }}>
          ✦ Question
        </span>
        <span className="message-time">{new Date(question.timestamp).toLocaleString('en-US')}</span>
      </div>
      <div className="interaction-panel-body">
        <p className="interaction-panel-content">{question.question}</p>

        {question.options.length > 0 && (
          <div className="interaction-panel-actions" style={{ marginBottom: '0.5rem' }}>
            {question.options.map((option) => (
              <button
                key={option}
                type="button"
                className="btn btn-sm"
                onClick={() => void onAnswer(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && answer.trim()) {
                void onAnswer(answer.trim());
              }
            }}
            placeholder="Scrivi una risposta…"
            style={{ flex: 1 }}
            aria-label="Risposta"
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (answer.trim()) void onAnswer(answer.trim());
            }}
            disabled={!answer.trim()}
          >
            Invia
          </button>
        </div>
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
    <div style={{ padding: '0 1rem', flexShrink: 0 }}>
      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          question={q}
          onAnswer={(answer) => onAnswerQuestion(q, answer)}
        />
      ))}

      {permissions.map((permission) => (
        <article
          key={permission.id}
          className="interaction-panel"
          style={{ marginBottom: '0.5rem', borderLeftColor: '#d0a215', borderLeftWidth: '3px' }}
        >
          <div className="interaction-panel-header">
            <span className="interaction-panel-title" style={{ color: '#d0a215' }}>
              ⚡ Permission
            </span>
            <span className="message-time">
              {new Date(permission.timestamp).toLocaleString('en-US')}
            </span>
          </div>
          <div className="interaction-panel-body">
            <p className="interaction-panel-content">
              <strong>{permission.action}</strong>
              {' · '}
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code)' }}>
                {permission.resource}
              </code>
            </p>
            <div className="interaction-panel-actions">
              <button
                type="button"
                className="btn btn-sm"
                style={{ borderColor: 'var(--success)', color: 'var(--success)' }}
                onClick={() => void onApprovePermission(permission)}
              >
                ✓ Approva
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }}
                onClick={() => void onDenyPermission(permission)}
              >
                ✗ Nega
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
