import type { Session } from '../../sessions/store.js';
import type { SdkMessageInfo, SdkMessageWithParts, SdkPart, SdkSession } from './types.js';

type SessionMessage = Session['messages'][number];

export function getExternalMessageId(msg: SessionMessage): string {
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

export function toSdkMessageInfo(sessionId: string, msg: SessionMessage): SdkMessageInfo {
  const messageId = getExternalMessageId(msg);
  return {
    id: messageId,
    sessionID: sessionId,
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    time: { created: new Date(msg.timestamp).getTime() },
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

export function toSdkMessages(sessionId: string, messages: Session['messages']): SdkMessageWithParts[] {
  const grouped: SdkMessageWithParts[] = [];
  let currentUser: SdkMessageWithParts | null = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (currentUser) grouped.push(currentUser);
      currentUser = {
        info: toSdkMessageInfo(sessionId, msg),
        parts: toSdkParts(sessionId, msg),
      };
      continue;
    }

    if (msg.role === 'assistant') {
      if (currentUser) {
        grouped.push(currentUser);
        currentUser = null;
      }
      grouped.push({
        info: toSdkMessageInfo(sessionId, msg),
        parts: toSdkParts(sessionId, msg),
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
        last.parts.push(...toSdkParts(sessionId, msg));
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
