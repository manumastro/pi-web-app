/**
 * Streaming lifecycle tracking.
 *
 * Derives streaming state from the sync child store's session_status and
 * message/part updates. Components read this to know which messages are
 * currently streaming and their lifecycle phase.
 */

import { create } from "zustand"
import type { Message, SessionStatus } from "@opencode-ai/sdk/v2/client"
import type { State } from "./types"

export type StreamPhase = "streaming" | "cooldown" | "completed"

export type MessageStreamState = {
  phase: StreamPhase
  startedAt: number
  lastUpdateAt: number
  completedAt?: number
}

export type StreamingStore = {
  /** Currently streaming message per session */
  streamingMessageIds: Map<string, string | null>
  /** Lifecycle phase per message */
  messageStreamStates: Map<string, MessageStreamState>
}

export const useStreamingStore = create<StreamingStore>()(() => ({
  streamingMessageIds: new Map(),
  messageStreamStates: new Map(),
}))

/**
 * Called from the SyncBridge/flush handler when child store state changes.
 * Derives streaming state from session_status + messages.
 */
/** Only update lastUpdateAt every this many ms to avoid 60Hz store churn */
const STREAMING_HEARTBEAT_MS = 1000

function getLastAssistantMessage(messages: Message[] | undefined): Message | null {
  if (!messages || messages.length === 0) {
    return null
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      return messages[i]
    }
  }

  return null
}

function isMessageCompleted(message: Message | null): boolean {
  if (!message) {
    return false
  }
  return typeof (message as { time?: { completed?: unknown } }).time?.completed === "number"
}

export function updateStreamingState(state: State) {
  const now = Date.now()
  const currentStore = useStreamingStore.getState()
  const currentStreamingIds = currentStore.streamingMessageIds
  const currentStreamStates = currentStore.messageStreamStates

  const nextStreamingIds = new Map<string, string | null>()
  const nextStreamStates = new Map(currentStreamStates)
  let changed = false

  const activeSessionIds = new Set<string>()
  for (const [sessionID, status] of Object.entries(state.session_status ?? {})) {
    if ((status as SessionStatus).type === "busy" || (status as SessionStatus).type === "retry") {
      activeSessionIds.add(sessionID)
    }
  }

  const allSessionIds = new Set<string>([
    ...Object.keys(state.message ?? {}),
    ...Object.keys(state.session_status ?? {}),
    ...currentStreamingIds.keys(),
  ])

  for (const sessionID of allSessionIds) {
    const messages = state.message[sessionID]
    const lastAssistant = getLastAssistantMessage(messages)
    const isAssistantStreaming = lastAssistant !== null && !isMessageCompleted(lastAssistant)
    const isActive = activeSessionIds.has(sessionID)
    const currentStreamingMessageId = currentStreamingIds.get(sessionID) ?? null

    const streamingMsg = isAssistantStreaming
      ? lastAssistant
      : (isActive && currentStreamingMessageId && !lastAssistant
        ? (messages?.find((message) => message.id === currentStreamingMessageId) ?? null)
        : null)
    const msgId = streamingMsg?.id ?? null

    if (msgId) {
      nextStreamingIds.set(sessionID, msgId)

      const existing = nextStreamStates.get(msgId)
      if (!existing || existing.phase !== "streaming") {
        nextStreamStates.set(msgId, {
          phase: "streaming",
          startedAt: existing?.startedAt ?? now,
          lastUpdateAt: now,
        })
        changed = true
      } else if (now - existing.lastUpdateAt >= STREAMING_HEARTBEAT_MS) {
        // Throttle lastUpdateAt writes to ~1Hz instead of 60Hz
        nextStreamStates.set(msgId, {
          ...existing,
          lastUpdateAt: now,
        })
        changed = true
      }
      if (currentStreamingIds.get(sessionID) !== msgId) {
        changed = true
      }
      continue
    }

    if (currentStreamingMessageId) {
      nextStreamingIds.set(sessionID, null)
      const existing = nextStreamStates.get(currentStreamingMessageId)
      if (existing && existing.phase === "streaming") {
        nextStreamStates.set(currentStreamingMessageId, {
          ...existing,
          phase: "completed",
          completedAt: now,
        })
        changed = true
      }
      changed = true
    }
  }

  if (changed) {
    useStreamingStore.setState({
      streamingMessageIds: nextStreamingIds,
      messageStreamStates: nextStreamStates,
    })
  }
}

// Selectors
export const selectStreamingMessageId = (sessionID: string) =>
  (state: StreamingStore) => state.streamingMessageIds.get(sessionID) ?? null

export const selectMessageStreamState = (messageID: string) =>
  (state: StreamingStore) => state.messageStreamStates.get(messageID) ?? null

export const selectIsStreaming = (sessionID: string) =>
  (state: StreamingStore) => state.streamingMessageIds.get(sessionID) != null
