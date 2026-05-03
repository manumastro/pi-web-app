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
  };
}

function modelForSession(session: Session): { providerID: string; modelID: string } {
  const parsedModel = parseModelKey(session.model);
  return {
    providerID: parsedModel?.provider ?? 'openai-codex',
    modelID: parsedModel?.modelId ?? 'gpt-5.4-mini',
  };
}

export function toSdkAssistantMessageInfo(
  session: Session,
  messageId: string,
  created = Date.now(),
  parentID = '',
  completed?: number,
): SdkMessageInfo {
  const { providerID, modelID } = modelForSession(session);
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
  const { providerID, modelID } = modelForSession(session);

  if (msg.role === 'assistant') {
    const previousUser = [...session.messages]
      .reverse()
      .find((candidate) => candidate.role === 'user' && new Date(candidate.timestamp).getTime() <= created);
    return toSdkAssistantMessageInfo(session, messageId, created, previousUser ? getExternalMessageId(previousUser) : '', created);
  }

  return {
    id: messageId,
    sessionID: session.id,
    role: 'user',
    time: { created },
    agent: 'build',
    model: { providerID, modelID },
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

export function toSdkMessages(session: Session): SdkMessageWithParts[] {
  const grouped: SdkMessageWithParts[] = [];
  let currentUser: SdkMessageWithParts | null = null;

  for (const msg of session.messages) {
    if (msg.role === 'user') {
      if (currentUser) grouped.push(currentUser);
      currentUser = {
        info: toSdkMessageInfo(session, msg),
        parts: toSdkParts(session.id, msg),
      };
      continue;
    }

    if (msg.role === 'assistant') {
      if (currentUser) {
        grouped.push(currentUser);
        currentUser = null;
      }
      grouped.push({
        info: toSdkMessageInfo(session, msg),
        parts: toSdkParts(session.id, msg),
      });
      continue;
    }

    if (currentUser) {
      grouped.push(currentUser);
      currentUser = null;
    }

    if (grouped.length > 0) {
      const last = grouped[grouped.length - 1]!;
      if (last.info.role === 'assistant') {
        last.parts.push(...toSdkParts(session.id, msg));
      }
    }
  }

  if (currentUser) grouped.push(currentUser);
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
