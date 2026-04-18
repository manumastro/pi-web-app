import { describe, expect, it } from 'vitest';
import type { PermissionItem, QuestionItem } from './chatState';
import { buildPermissionDecisionMessage, buildPermissionStatusLabel, buildQuestionFollowUpMessage, buildQuestionStatusLabel } from './interactionMessages';

describe('interactionMessages', () => {
  const question: QuestionItem = {
    kind: 'question',
    id: 'q1',
    questionId: 'q1',
    question: 'Do you want to continue with the deployment pipeline?',
    options: ['yes', 'no'],
    timestamp: '2026-04-15T10:00:00.000Z',
  };

  const permission: PermissionItem = {
    kind: 'permission',
    id: 'p1',
    permissionId: 'p1',
    action: 'write',
    resource: '/tmp/file',
    timestamp: '2026-04-15T10:00:01.000Z',
  };

  it('formats question follow-up messages and labels', () => {
    expect(buildQuestionFollowUpMessage(question, 'yes')).toContain('Question response [q1]');
    expect(buildQuestionFollowUpMessage(question, 'yes')).toContain('=> yes');
    expect(buildQuestionStatusLabel(question)).toContain('Risposta domanda:');
  });

  it('formats permission decision messages and labels', () => {
    expect(buildPermissionDecisionMessage(permission, 'approved')).toContain('Permission decision [p1] APPROVED write /tmp/file');
    expect(buildPermissionStatusLabel(permission, 'approved')).toContain('Approva permesso:');
  });
});
