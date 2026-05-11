import type { Message, Part } from '@opencode-ai/sdk/v2/client';

type MessageTime = { created?: unknown; completed?: unknown } | undefined

type MessageLike = Message & {
  parentID?: unknown
  providerID?: unknown
  modelID?: unknown
  agent?: unknown
  variant?: unknown
  clientRole?: unknown
  sessionID?: unknown
  time?: MessageTime
}

const readRole = (message: MessageLike): string => {
  const clientRole = typeof message.clientRole === 'string' ? message.clientRole : ''
  const role = typeof message.role === 'string' ? message.role : ''
  return clientRole || role
}

const readParentId = (message: MessageLike): string | null => {
  const parentID = message.parentID
  return typeof parentID === 'string' && parentID.trim().length > 0 ? parentID.trim() : null
}

const readCreatedAt = (message: MessageLike): number | null => {
  const created = message.time?.created
  return typeof created === 'number' ? created : null
}

const readSessionId = (message: MessageLike): string | null => {
  return typeof message.sessionID === 'string' ? message.sessionID : null
}

const isCompleted = (message: MessageLike): boolean => {
  return typeof message.time?.completed === 'number'
}

const readLaneKey = (message: MessageLike): string | null => {
  if (readRole(message) !== 'assistant') {
    return null
  }

  const parentID = readParentId(message)
  if (!parentID) {
    return null
  }

  const providerID = typeof message.providerID === 'string' ? message.providerID.trim() : ''
  const modelID = typeof message.modelID === 'string' ? message.modelID.trim() : ''
  const agent = typeof message.agent === 'string' ? message.agent.trim() : ''
  const variant = typeof message.variant === 'string' ? message.variant.trim() : ''

  return [parentID, providerID, modelID, agent, variant].join('|')
}

/**
 * Primary strategy: match by lane key (parentID + provider/model/agent/variant).
 * Prevents duplicate entries when the same logical assistant message arrives
 * from event replay or a final snapshot with a slightly different ID.
 */
const shouldCollapseByLaneKey = (existing: MessageLike, incoming: MessageLike): boolean => {
  const existingKey = readLaneKey(existing)
  const incomingKey = readLaneKey(incoming)
  if (!existingKey || !incomingKey || existingKey !== incomingKey) {
    return false
  }

  // Incomplete existing → collapse (incoming is a final/synthetic snapshot)
  if (!isCompleted(existing)) {
    return true
  }

  // Incomplete incoming but existing completed → keep completed (don't regress)
  if (!isCompleted(incoming)) {
    return false
  }

  // Both completed: collapse only when created time matches exactly
  // (different created timestamps = distinct retries)
  const existingCreated = readCreatedAt(existing)
  const incomingCreated = readCreatedAt(incoming)
  return existingCreated !== null && incomingCreated !== null && existingCreated === incomingCreated
}

/**
 * Fallback strategy: match assistant messages in the same session with very
 * close created timestamps (within 50ms). This handles the case where the
 * Pi CLI's native global events and the Pi Web orchestrator's directory
 * events both send `message.updated` for the same logical message but with
 * different IDs and potentially different fields (e.g., one lacks parentID).
 *
 * 50ms tolerance is safe because:
 * - Distinct turns are separated by at least several seconds
 * - Two sources emitting for the same event have timestamps from the same payload
 */
const TIME_TOLERANCE_MS = 50

const shouldCollapseByTime = (existing: MessageLike, incoming: MessageLike): boolean => {
  if (readRole(existing) !== 'assistant' || readRole(incoming) !== 'assistant') {
    return false
  }

  // When both messages have lane keys (parentID set), lane key matching is
  // authoritative. Don't override it with time-based matching, because that
  // would collapse legitimate retries with close created timestamps.
  if (readLaneKey(existing) !== null && readLaneKey(incoming) !== null) {
    return false
  }

  const existingSessionId = readSessionId(existing)
  const incomingSessionId = readSessionId(incoming)
  if (!existingSessionId || existingSessionId !== incomingSessionId) {
    return false
  }

  const existingCreated = readCreatedAt(existing)
  const incomingCreated = readCreatedAt(incoming)
  if (existingCreated === null || incomingCreated === null) {
    return false
  }

  if (Math.abs(existingCreated - incomingCreated) > TIME_TOLERANCE_MS) {
    return false
  }

  // Don't collapse two completed messages via time matching — without lane keys
  // we can't confidently tell retries from duplicates.
  if (isCompleted(existing) && isCompleted(incoming)) {
    return false
  }

  // Collapse if the existing is incomplete (streaming) → incoming replaces it
  if (!isCompleted(existing)) {
    return true
  }

  // Existing is complete but incoming is not → keep existing (don't regress)
  return false
}

/**
 * Given an incoming message and the existing messages for the same session,
 * return a copy with `id` potentially replaced by an existing message's ID
 * that represents the same logical assistant response.
 *
 * This prevents duplicate assistant message entries when:
 * - The same snapshot arrives through two channels with different IDs
 * - A final `message.updated` lands with a different ID than the live one
 */
export function withCanonicalAssistantMessageId(existingMessages: readonly Message[], incoming: Message): Message {
  if (readRole(incoming as MessageLike) !== 'assistant') {
    return incoming
  }

  // Primary: lane key matching (needs parentID on both sides)
  for (let index = existingMessages.length - 1; index >= 0; index -= 1) {
    const existing = existingMessages[index] as MessageLike | undefined
    if (!existing || existing.id === incoming.id) {
      continue
    }
    if (shouldCollapseByLaneKey(existing, incoming as MessageLike)) {
      return { ...incoming, id: existing.id }
    }
  }

  // Fallback: time-based matching (handles missing parentID in Pi CLI events)
  for (let index = existingMessages.length - 1; index >= 0; index -= 1) {
    const existing = existingMessages[index] as MessageLike | undefined
    if (!existing || existing.id === incoming.id) {
      continue
    }
    if (shouldCollapseByTime(existing, incoming as MessageLike)) {
      return { ...incoming, id: existing.id }
    }
  }

  return incoming
}

export function withCanonicalAssistantPartMessageId(parts: Part[], messageID: string): Part[] {
  if (parts.length === 0) {
    return parts
  }

  let changed = false
  const next = parts.map((part) => {
    const currentMessageId = (part as { messageID?: unknown }).messageID
    if (currentMessageId === messageID) {
      return part
    }
    changed = true
    return {
      ...part,
      messageID,
    } as Part
  })

  return changed ? next : parts
}
