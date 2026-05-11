import { describe, expect, test } from "vitest"
import type { Part } from "@opencode-ai/sdk/v2"
import { normalizeParts } from "./partUtils"

describe("normalizeParts", () => {
  test("dedupes adjacent duplicated text parts", () => {
    const parts = [
      { id: "p1", type: "text", text: "hello" } as Part,
      { id: "p2", type: "text", text: "hello" } as Part,
      { id: "p3", type: "text", text: "world" } as Part,
    ]

    const result = normalizeParts(parts)
    expect(result).toHaveLength(1)
    expect((result[0] as { text?: string }).text).toBe("world")
  })

  test("collapses non-adjacent repeated lane snapshots to the most complete part", () => {
    const parts = [
      { id: "p1", type: "text", text: "hello" } as Part,
      { id: "p2", type: "reasoning", text: "thinking" } as Part,
      { id: "p3", type: "text", text: "hello world" } as Part,
    ]

    const result = normalizeParts(parts)
    expect(result).toHaveLength(2)
    expect((result[0] as { text?: string }).text).toBe("hello world")
    expect(result[1].type).toBe("reasoning")
  })
})
