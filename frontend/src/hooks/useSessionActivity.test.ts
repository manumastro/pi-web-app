import { describe, expect, it } from 'vitest'
import type { Message } from '@opencode-ai/sdk/v2/client'
import { deriveSessionActivity } from './useSessionActivity'

const assistantMessage = (completed?: number): Message => ({
  id: 'assistant-1',
  role: 'assistant',
  sessionID: 'session-1',
  time: completed ? { created: 1, completed } : { created: 1 },
} as Message)

describe('deriveSessionActivity', () => {
  it('keeps the session working when session.status goes idle before the assistant message completes', () => {
    const result = deriveSessionActivity({
      sessionId: 'session-1',
      status: { type: 'idle' },
      messages: [assistantMessage()],
      hasPendingPrompt: false,
    })

    expect(result.phase).toBe('busy')
    expect(result.isWorking).toBe(true)
    expect(result.isBusy).toBe(true)
  })

  it('shows prompting while a permission or question is pending', () => {
    const result = deriveSessionActivity({
      sessionId: 'session-1',
      status: { type: 'idle' },
      messages: [assistantMessage()],
      hasPendingPrompt: true,
    })

    expect(result.phase).toBe('prompting')
    expect(result.isWorking).toBe(true)
    expect(result.isBusy).toBe(false)
  })

  it('is busy immediately after send when the session status is busy', () => {
    const result = deriveSessionActivity({
      sessionId: 'session-1',
      status: { type: 'busy' },
      messages: [],
      hasPendingPrompt: false,
    })

    expect(result.phase).toBe('busy')
    expect(result.isWorking).toBe(true)
    expect(result.isBusy).toBe(true)
  })

  it('is idle with no active session', () => {
    const result = deriveSessionActivity({
      sessionId: null,
      messages: [],
      hasPendingPrompt: false,
    })

    expect(result.phase).toBe('idle')
    expect(result.isWorking).toBe(false)
  })
})
