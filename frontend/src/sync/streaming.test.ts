import { beforeEach, describe, expect, it } from 'vitest'
import type { Message } from '@opencode-ai/sdk/v2/client'
import { INITIAL_STATE } from './types'
import { updateStreamingState, useStreamingStore } from './streaming'

const assistantMessage = (completed?: number): Message => ({
  id: 'assistant-1',
  role: 'assistant',
  sessionID: 'session-1',
  time: completed ? { created: 1, completed } : { created: 1 },
} as Message)

const buildState = (completed?: number) => ({
  ...structuredClone(INITIAL_STATE),
  session_status: { 'session-1': { type: 'idle' as const } },
  message: { 'session-1': [assistantMessage(completed)] },
  part: {},
  permission: {},
  question: {},
  todo: {},
  session_diff: {},
})

describe('updateStreamingState', () => {
  beforeEach(() => {
    useStreamingStore.setState({
      streamingMessageIds: new Map(),
      messageStreamStates: new Map(),
    })
  })

  it('keeps the active assistant streaming until the final completion lands', () => {
    updateStreamingState(buildState())

    expect(useStreamingStore.getState().streamingMessageIds.get('session-1')).toBe('assistant-1')
    expect(useStreamingStore.getState().messageStreamStates.get('assistant-1')?.phase).toBe('streaming')

    updateStreamingState(buildState(1234))

    expect(useStreamingStore.getState().streamingMessageIds.get('session-1')).toBeNull()
    expect(useStreamingStore.getState().messageStreamStates.get('assistant-1')?.phase).toBe('completed')
  })
})
