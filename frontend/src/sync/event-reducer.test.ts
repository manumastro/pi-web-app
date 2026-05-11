import { describe, expect, test } from "vitest"
import type { Event, Message, Part } from "@opencode-ai/sdk/v2/client"
import { applyDirectoryEvent } from "./event-reducer"
import { INITIAL_STATE, type State } from "./types"

function buildState(): State {
  return {
    ...INITIAL_STATE,
    session: [],
    session_status: {},
    message: {},
    part: {},
    permission: {},
    question: {},
    todo: {},
    session_diff: {},
  }
}

describe("event reducer streaming dedupe", () => {
  test("replaces equivalent streaming parts instead of appending duplicates", () => {
    const state = buildState()
    state.part["m1"] = [
      { id: "p1", type: "text", text: "Hello" } as Part,
    ]

    const changed = applyDirectoryEvent(state, {
      type: "message.part.updated",
      properties: {
        part: { id: "p2", messageID: "m1", type: "text", text: "Hello world" },
      },
    } as unknown as Event)

    expect(changed).toBe(true)
    expect(state.part["m1"]).toHaveLength(1)
    expect((state.part["m1"][0] as { text?: string }).text).toBe("Hello world")
  })

  test("keeps message.part.delta idempotent across replayed live chunks", () => {
    const state = buildState()
    state.part["m1"] = [
      { id: "p1", type: "text", text: "Hello" } as Part,
    ]

    const delta = {
      type: "message.part.delta",
      properties: {
        messageID: "m1",
        partID: "p1",
        field: "text",
        delta: " world",
      },
    } as unknown as Event

    expect(applyDirectoryEvent(state, delta)).toBe(true)
    expect(applyDirectoryEvent(state, delta)).toBe(true)
    expect(state.part["m1"]).toHaveLength(1)
    expect((state.part["m1"][0] as { text?: string }).text).toBe("Hello world")
  })

  test("drops stale replay snapshots after a finalized lane already exists", () => {
    const state = buildState()
    state.part["m1"] = [
      { id: "p1", type: "text", text: "Hello world", time: { end: 20 } } as Part,
      { id: "r1", type: "reasoning", text: "Thinking more", time: { end: 21 } } as Part,
    ]

    const changed = applyDirectoryEvent(state, {
      type: "message.part.updated",
      properties: {
        part: { id: "p2", messageID: "m1", type: "text", text: "Hello" },
      },
    } as unknown as Event)

    expect(changed).toBe(true)
    expect(state.part["m1"]).toHaveLength(2)
    expect((state.part["m1"][0] as { text?: string }).text).toBe("Hello world")
    expect((state.part["m1"][1] as { text?: string }).text).toBe("Thinking more")
  })

  test("dedupes finalized assistant parts on message.updated", () => {
    const state = buildState()
    const message = {
      id: "m2",
      sessionID: "s1",
      role: "assistant",
      time: { created: 1, completed: 2 },
    } as Message

    state.message["s1"] = [message]
    state.part["m2"] = [
      { id: "t1", type: "text", text: "Answer" } as Part,
      { id: "t2", type: "text", text: "Answer" } as Part,
    ]

    const changed = applyDirectoryEvent(state, {
      type: "message.updated",
      properties: { info: message },
    } as unknown as Event)

    expect(changed).toBe(true)
    expect(state.part["m2"]).toHaveLength(1)
    expect((state.part["m2"][0] as { text?: string }).text).toBe("Answer")
  })

  test("collapses repeated live assistant snapshots when the final message.updated lands", () => {
    const state = buildState()
    const message = {
      id: "m3",
      sessionID: "s1",
      role: "assistant",
      time: { created: 1, completed: 2 },
    } as Message

    state.message["s1"] = [message]
    state.part["m3"] = [
      { id: "text-1", type: "text", text: "Hello" } as Part,
      { id: "text-2", type: "text", text: "Hello world" } as Part,
      { id: "reasoning-1", type: "reasoning", text: "Thinking" } as Part,
      { id: "reasoning-2", type: "reasoning", text: "Thinking more" } as Part,
    ]

    const changed = applyDirectoryEvent(state, {
      type: "message.updated",
      properties: { info: message },
    } as unknown as Event)

    expect(changed).toBe(true)
    expect(state.part["m3"]).toHaveLength(2)
    expect((state.part["m3"][0] as { text?: string }).text).toBe("Hello world")
    expect((state.part["m3"][1] as { text?: string }).text).toBe("Thinking more")
  })

  test("keeps the canonical assistant id when a final snapshot arrives with a different id", () => {
    const state = buildState()
    const user = {
      id: "u1",
      sessionID: "s1",
      role: "user",
      time: { created: 1 },
    } as Message
    const liveAssistant = {
      id: "a-live",
      sessionID: "s1",
      role: "assistant",
      parentID: "u1",
      providerID: "openai",
      modelID: "gpt-5",
      time: { created: 2 },
    } as Message

    state.message["s1"] = [liveAssistant, user]
    state.part["a-live"] = [
      { id: "a-live-text", type: "text", text: "draft" } as Part,
    ]

    const changed = applyDirectoryEvent(state, {
      type: "message.updated",
      properties: {
        info: {
          ...liveAssistant,
          id: "a-final",
          time: { created: 2, completed: 3 },
        },
      },
    } as unknown as Event)

    expect(changed).toBe(true)
    expect(state.message["s1"]).toHaveLength(2)
    expect(state.message["s1"][0].id).toBe("a-live")
    expect((state.message["s1"][0] as { time?: { completed?: number } }).time?.completed).toBe(3)
    expect(state.part["a-live"]).toHaveLength(1)
    expect((state.part["a-live"][0] as { text?: string }).text).toBe("draft")
    expect(state.part["a-final"]).toBeUndefined()
  })
})
