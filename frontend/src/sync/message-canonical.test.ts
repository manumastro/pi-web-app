import { describe, expect, it } from 'vitest'
import type { Message } from '@opencode-ai/sdk/v2/client'
import { withCanonicalAssistantMessageId } from './message-canonical'

const user = {
  id: 'u1',
  sessionID: 's1',
  role: 'user',
  time: { created: 1 },
} as Message

const liveAssistant = {
  id: 'a-live',
  sessionID: 's1',
  role: 'assistant',
  parentID: 'u1',
  providerID: 'openai',
  modelID: 'gpt-5',
  time: { created: 2 },
} as Message

describe('message canonicalization', () => {
  it('keeps the live assistant id when the final snapshot arrives for the same lane', () => {
    const incoming = {
      ...liveAssistant,
      id: 'a-final',
      time: { created: 2, completed: 3 },
    } as Message

    const canonical = withCanonicalAssistantMessageId([user, liveAssistant], incoming)

    expect(canonical.id).toBe('a-live')
    expect(canonical.time?.completed).toBe(3)
  })

  it('does not collapse a later retry with a different created time', () => {
    const completedAssistant = {
      ...liveAssistant,
      time: { created: 2, completed: 3 },
    } as Message
    const retry = {
      ...liveAssistant,
      id: 'a-retry',
      time: { created: 4, completed: 5 },
    } as Message

    const canonical = withCanonicalAssistantMessageId([user, completedAssistant], retry)

    expect(canonical.id).toBe('a-retry')
  })

  it('collapses by time when Pi CLI event lacks parentID', () => {
    const orchestratorEntry = {
      id: 'a-orch',
      sessionID: 's1',
      role: 'assistant',
      parentID: 'u1',
      providerID: 'openai',
      modelID: 'gpt-5',
      time: { created: 42 },
    } as Message

    const piCliEvent = {
      id: 'a-pi-cli',
      sessionID: 's1',
      role: 'assistant',
      // No parentID — Pi CLI native event
      time: { created: 42 },
    } as Message

    const canonical = withCanonicalAssistantMessageId([user, orchestratorEntry], piCliEvent)

    expect(canonical.id).toBe('a-orch')
  })

  it('collapses by time when orchestrator event arrives after Pi CLI one (lacks parentID)', () => {
    const piCliEntry = {
      id: 'a-pi-cli',
      sessionID: 's1',
      role: 'assistant',
      // No parentID — Pi CLI native event
      time: { created: 42 },
    } as Message

    const orchestratorEvent = {
      id: 'a-orch',
      sessionID: 's1',
      role: 'assistant',
      parentID: 'u1',
      providerID: 'openai',
      modelID: 'gpt-5',
      time: { created: 42 },
    } as Message

    const canonical = withCanonicalAssistantMessageId([user, piCliEntry], orchestratorEvent)

    expect(canonical.id).toBe('a-pi-cli')
  })

  it('does NOT collapse two messages with very different created times', () => {
    const existing = {
      id: 'a-first',
      sessionID: 's1',
      role: 'assistant',
      time: { created: 100 },
    } as Message

    const incoming = {
      id: 'a-second',
      sessionID: 's1',
      role: 'assistant',
      time: { created: 5000 }, // 4.9 seconds later
    } as Message

    const canonical = withCanonicalAssistantMessageId([user, existing], incoming)

    expect(canonical.id).toBe('a-second')
  })
})
