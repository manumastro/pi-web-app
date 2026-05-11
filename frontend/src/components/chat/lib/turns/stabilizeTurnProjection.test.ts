import { describe, expect, test } from 'vitest'
import type { ChatMessageEntry } from './types'
import { projectTurnRecords } from './projectTurnRecords'

const userMessage = {
  info: {
    id: 'msg-user-1',
    role: 'user',
    sessionID: 'session-1',
    time: { created: 1 },
  },
  parts: [],
} as ChatMessageEntry

const assistantMessage = {
  info: {
    id: 'msg-assistant-1',
    role: 'assistant',
    sessionID: 'session-1',
    parentID: 'msg-user-1',
    time: { created: 2 },
  },
  parts: [
    { id: 'part-1', type: 'text', text: 'hello' },
  ],
} as ChatMessageEntry

const nextUserMessage = { ...userMessage, info: { ...userMessage.info, id: 'msg-user-2', time: { created: 4 } } } as ChatMessageEntry
const nextAssistantMessage = {
  info: {
    id: 'msg-assistant-2',
    role: 'assistant',
    sessionID: 'session-1',
    parentID: 'msg-user-2',
    time: { created: 5 },
  },
  parts: [
    { id: 'part-2', type: 'text', text: 'working' },
  ],
} as ChatMessageEntry

const messages = [userMessage, assistantMessage, nextUserMessage, nextAssistantMessage]

describe('projectTurnRecords stabilization', () => {
  test('reuses earlier turns so replay/live snapshots do not remount', () => {
    const previous = projectTurnRecords(messages)
    const next = projectTurnRecords(messages, { previousProjection: previous })

    expect(next.turns).toHaveLength(2)
    expect(next.turns[0]).toBe(previous.turns[0])
    expect(next.turns[0].assistantMessages[0]).toBe(previous.turns[0].assistantMessages[0])
  })

  test('keeps earlier turns stable when only the streaming tail changes', () => {
    const streamingAssistant = {
      info: {
        id: 'msg-assistant-3',
        role: 'assistant',
        sessionID: 'session-1',
        parentID: 'msg-user-2',
        time: { created: 6 },
      },
      parts: [
        { id: 'part-3', type: 'text', text: 'working more' },
      ],
    } as ChatMessageEntry

    const previous = projectTurnRecords(messages)
    const next = projectTurnRecords([...messages, streamingAssistant], {
      previousProjection: previous,
    })

    expect(next.turns).toHaveLength(2)
    expect(next.turns[0]).toBe(previous.turns[0])
    expect(next.turns[1]).not.toBe(previous.turns[1])
  })
})
