import { beforeEach, describe, expect, test, vi } from "vitest"
import { create } from "zustand"
import type { DirectoryStore } from "./child-store"
import { INITIAL_STATE } from "./types"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"

const abortCalls: Array<Record<string, unknown>> = []
const sendCalls: Array<string> = []

const scopedSessionClient = {
  session: {
    abort: vi.fn((params: Record<string, unknown>) => {
      abortCalls.push(params)
      return Promise.resolve({ data: true })
    }),
  },
}

const sdkClient = {
  session: {
    abort: vi.fn((params: Record<string, unknown>) => {
      abortCalls.push(params)
      return Promise.resolve({ data: true })
    }),
  },
} as unknown as OpencodeClient

vi.mock("@/lib/opencode/client", () => ({
  opencodeClient: {
    getScopedSdkClient: (_: string) => scopedSessionClient,
    getDirectory: () => "/fallback",
  },
}))

vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => ({ isConnected: true, hasEverConnected: true, probeConnection: async () => true }),
  },
}))

vi.mock("./session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      getDirectoryForSession: (sessionId: string) => (sessionId === "session-1" ? "/project-a" : null),
    }),
  },
}))

vi.mock("./input-store", () => ({ useInputStore: {} }))
vi.mock("@/stores/useGlobalSessionsStore", () => ({ useGlobalSessionsStore: {} }))
vi.mock("./sync-refs", () => ({ registerSessionDirectory: () => {} }))

import { abortCurrentOperation, optimisticSend, setActionRefs, setOptimisticRefs } from "./session-actions"

function createStore(): ReturnType<typeof create<DirectoryStore>> {
  return create<DirectoryStore>()((set) => ({
    ...INITIAL_STATE,
    patch: (partial) => set(partial),
    replace: (next) => set(next),
  }))
}

describe("session working status + abort routing", () => {
  beforeEach(() => {
    abortCalls.length = 0
    sendCalls.length = 0
  })

  test("optimisticSend sets busy status in session directory store", async () => {
    const storeA = createStore()
    const storeFallback = createStore()

    const childStores = {
      children: new Map([
        ["/project-a", storeA],
        ["/fallback", storeFallback],
      ]),
      ensureChild: (dir: string) => {
        if (dir === "/project-a") return storeA
        if (dir === "/fallback") return storeFallback
        throw new Error("missing store")
      },
    } as unknown as import("./child-store").ChildStoreManager

    setActionRefs(sdkClient, childStores, () => "/fallback")
    setOptimisticRefs(
      () => {},
      () => {},
    )

    await optimisticSend({
      sessionId: "session-1",
      content: "ciao",
      providerID: "p",
      modelID: "m",
      send: async (messageID: string) => {
        sendCalls.push(messageID)
      },
    })

    expect(sendCalls.length).toBe(1)
    expect(storeA.getState().session_status["session-1"]?.type).toBe("busy")
    expect(storeFallback.getState().session_status["session-1"]).toBeUndefined()
  })

  test("abortCurrentOperation uses session-scoped client + directory", async () => {
    await abortCurrentOperation("session-1")
    expect(abortCalls.length).toBe(1)
    expect(abortCalls[0].sessionID).toBe("session-1")
    expect(abortCalls[0].directory).toBe("/project-a")
  })
})
