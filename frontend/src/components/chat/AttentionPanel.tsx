import { useState } from 'react';

function payloadField(payload: unknown, key: string): string {
  if (!payload || typeof payload !== 'object') return '';
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function textFromAttentionPayload(payload: unknown, fallback: string): string {
  return payloadField(payload, 'message') || payloadField(payload, 'question') || fallback;
}

function questionIdFromPayload(payload: unknown): string {
  return payloadField(payload, 'questionId') || payloadField(payload, 'id');
}

export function AttentionPanel({
  sessionId,
  questions,
  permissions,
  onAnswerQuestion,
}: {
  sessionId: string;
  questions: unknown[];
  permissions: unknown[];
  onAnswerQuestion: (sessionId: string, questionId: string, answer: string) => Promise<boolean>;
}) {
  const latestQuestion = questions.at(-1);
  const latestPermission = permissions.at(-1);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  if (!latestQuestion && !latestPermission) return null;

  const questionId = questionIdFromPayload(latestQuestion);
  const submitAnswer = async () => {
    const trimmed = answer.trim();
    if (!sessionId || !questionId || !trimmed) return;
    setSubmitting(true);
    setError('');
    const ok = await onAnswerQuestion(sessionId, questionId, trimmed);
    setSubmitting(false);
    if (ok) setAnswer('');
    else setError('Unable to submit answer');
  };

  return (
    <div className="attention-panel-stack">
      {latestQuestion ? (
        <section className="question-card">
          <div className="question-header"><div className="question-icon">?</div><div className="question-title">Question pending</div></div>
          <div className="question-content">
            <div className="question-text">{textFromAttentionPayload(latestQuestion, 'The agent is waiting for your answer.')}</div>
            <textarea className="question-answer-input" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type your answer…" rows={3} />
            {error ? <div className="question-error">{error}</div> : null}
          </div>
          <div className="question-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={!answer.trim() || submitting || !questionId} onClick={() => void submitAnswer()}>
              {submitting ? 'Sending…' : 'Submit answer'}
            </button>
          </div>
        </section>
      ) : null}
      {latestPermission ? (
        <section className="permission-card">
          <div className="permission-header"><div className="permission-icon">!</div><div className="permission-title">Permission needed</div></div>
          <div className="permission-content"><div className="permission-tool-info">{textFromAttentionPayload(latestPermission, 'The agent is requesting approval for a sensitive action.')}</div></div>
          <div className="permission-actions"><span className="text-xs text-muted-foreground">Permission transport is intentionally not wired in this pass.</span></div>
        </section>
      ) : null}
    </div>
  );
}
