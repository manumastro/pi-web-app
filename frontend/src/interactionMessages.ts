import type { PermissionItem, QuestionItem } from './chatState';

function truncate(value: string, max = 64): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function buildQuestionFollowUpMessage(question: QuestionItem, answer: string): string {
  return `Question response [${question.questionId}] ${truncate(question.question)} => ${answer}`;
}

export function buildQuestionStatusLabel(question: QuestionItem): string {
  return `Risposta domanda: ${truncate(question.question)}`;
}

export function buildPermissionDecisionMessage(permission: PermissionItem, decision: 'approved' | 'denied'): string {
  return `Permission decision [${permission.permissionId}] ${decision.toUpperCase()} ${permission.action} ${permission.resource}`;
}

export function buildPermissionStatusLabel(permission: PermissionItem, decision: 'approved' | 'denied'): string {
  return `${decision === 'approved' ? 'Approva' : 'Nega'} permesso: ${truncate(permission.action)}`;
}
