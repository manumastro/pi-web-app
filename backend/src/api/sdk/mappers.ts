import type { Session } from '../../sessions/store.js';
import { parseModelKey } from '../../models/resolver.js';
import type { SdkMessageInfo, SdkMessageWithParts, SdkPart, SdkSession } from './types.js';

type SessionMessage = Session['messages'][number];

export function getExternalMessageId(msg: SessionMessage): string {
  // Keep optimistic reconciliation stable for user messages (client messageId).
  // Pi-wrapper assistant turns are assigned a separate client-visible id
  // (`${userMessageId}_assistant`), which keeps OpenChamber's id-sorted arrays
  // in user→assistant order during live streaming and reloads.
  const candidate = typeof msg.messageId === 'string' ? msg.messageId.trim() : '';
  return candidate || msg.id;
}

export function toSdkSession(session: Session, projectId = 'pi-web-project'): SdkSession {
  const title = session.title || 'Session';
  return {
    id: session.id,
    slug: session.id,
    projectID: projectId,
    directory: session.cwd,
    title,
    version: '1',
    time: {
      created: new Date(session.createdAt).getTime(),
      updated: new Date(session.updatedAt).getTime(),
    },
    // Pi-specific metadata (available in session store but was not exposed)
    model: session.model,
    thinkingLevel: session.thinkingLevel,
    piSessionId: session.piSessionId,
    piSessionFile: session.piSessionFile,
    statusMessage: session.statusMessage,
    statusMetadata: session.statusMetadata,
  };
}

function modelFromKey(modelKey: string | undefined): { providerID: string; modelID: string } {
  const parsedModel = parseModelKey(modelKey);
  return {
    providerID: parsedModel?.provider ?? 'openai-codex',
    modelID: parsedModel?.modelId ?? 'gpt-5.4-mini',
  };
}

function modelForSession(session: Session): { providerID: string; modelID: string } {
  return modelFromKey(session.model);
}

export function toSdkAssistantMessageInfo(
  session: Session,
  messageId: string,
  created = Date.now(),
  parentID = '',
  completed?: number,
  modelKey?: string,
): SdkMessageInfo {
  const { providerID, modelID } = modelFromKey(modelKey ?? session.model);
  return {
    id: messageId,
    sessionID: session.id,
    role: 'assistant',
    time: { created, ...(typeof completed === 'number' ? { completed } : {}) },
    parentID,
    providerID,
    modelID,
    mode: 'build',
    path: { cwd: session.cwd, root: session.cwd },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  };
}

export function toSdkMessageInfo(session: Session, msg: SessionMessage): SdkMessageInfo {
  const messageId = getExternalMessageId(msg);
  const created = new Date(msg.timestamp).getTime();
  const { providerID, modelID } = modelFromKey(msg.model ?? session.model);

  if (msg.role === 'assistant') {
    const previousUser = [...session.messages]
      .reverse()
      .find((candidate) => candidate.role === 'user' && new Date(candidate.timestamp).getTime() <= created);
    return toSdkAssistantMessageInfo(
      session,
      messageId,
      created,
      previousUser ? getExternalMessageId(previousUser) : '',
      created,
      msg.model,
    );
  }

  return {
    id: messageId,
    sessionID: session.id,
    role: 'user',
    time: { created },
    agent: 'build',
    model: {
      providerID,
      modelID,
      ...(session.thinkingLevel ? { variant: session.thinkingLevel } : {}),
    },
  };
}

export function toSdkParts(sessionId: string, msg: SessionMessage): SdkPart[] {
  const parts: SdkPart[] = [];
  const messageId = getExternalMessageId(msg);

  if (msg.content) {
    const partType = msg.role === 'tool_call' ? 'tool' : msg.role === 'tool_result' ? 'tool' : 'text';
    parts.push({
      id: `${messageId}-text`,
      sessionID: sessionId,
      messageID: messageId,
      type: partType,
      text: msg.content,
    });
  }

  return parts;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function toolPartId(messageId: string, msg: SessionMessage): string {
  const callId = typeof msg.toolCallId === 'string' && msg.toolCallId.length > 0 ? msg.toolCallId : msg.id;
  return `${messageId}-${callId}`;
}

function upsertToolPart(parts: SdkPart[], sessionId: string, msg: SessionMessage): void {
  const messageId = getExternalMessageId(msg);
  const id = toolPartId(messageId, msg);
  const existing = parts.find((part) => part.id === id);
  const tool = typeof msg.toolName === 'string' && msg.toolName.length > 0
    ? msg.toolName
    : typeof existing?.tool === 'string'
      ? existing.tool
      : 'tool';
  const callID = typeof msg.toolCallId === 'string' && msg.toolCallId.length > 0 ? msg.toolCallId : id;

  if (msg.role === 'tool_result') {
    const resultState = {
      status: msg.success === false ? 'error' : 'completed',
      input: (existing?.state as { input?: unknown } | undefined)?.input ?? {},
      output: msg.content,
      title: tool,
      time: { start: new Date(msg.timestamp).getTime() - 1000, end: new Date(msg.timestamp).getTime() },
      ...(msg.success === false ? { error: msg.content } : {}),
    };
    if (existing) {
      existing.tool = tool;
      existing.callID = callID;
      existing.state = resultState;
      return;
    }
    parts.push({ id, sessionID: sessionId, messageID: messageId, type: 'tool', callID, tool, state: resultState });
    return;
  }

  const input = parseJsonObject(msg.content);
  const runningState = {
    status: 'running',
    input,
    title: tool,
    time: { start: new Date(msg.timestamp).getTime() },
  };
  if (existing) {
    existing.tool = tool;
    existing.callID = callID;
    existing.state = runningState;
    return;
  }
  parts.push({ id, sessionID: sessionId, messageID: messageId, type: 'tool', callID, tool, state: runningState });
}

export function toSdkMessages(session: Session): SdkMessageWithParts[] {
  const grouped: SdkMessageWithParts[] = [];
  const toolPartsByAssistantId = new Map<string, SdkPart[]>();

  for (const msg of session.messages) {
    if (msg.role === 'tool_call' || msg.role === 'tool_result') {
      const assistantId = getExternalMessageId(msg);
      const parts = toolPartsByAssistantId.get(assistantId) ?? [];
      upsertToolPart(parts, session.id, msg);
      toolPartsByAssistantId.set(assistantId, parts);
      continue;
    }

    if (msg.role === 'user') {
      grouped.push({
        info: toSdkMessageInfo(session, msg),
        parts: toSdkParts(session.id, msg),
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const assistantId = getExternalMessageId(msg);
      grouped.push({
        info: toSdkMessageInfo(session, msg),
        parts: [
          ...(toolPartsByAssistantId.get(assistantId) ?? []),
          ...toSdkParts(session.id, msg),
        ],
      });
    }
  }

  return grouped;
}

export function toSdkSessionStatus(status: Session['status']): { type: 'idle' | 'busy' | 'retry' } {
  switch (status) {
    case 'busy':
    case 'prompting':
    case 'answering':
    case 'waiting_question':
    case 'waiting_permission':
      return { type: 'busy' };
    case 'retry':
      return { type: 'retry' };
    default:
      return { type: 'idle' };
  }
}
