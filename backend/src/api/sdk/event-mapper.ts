import type { SseEvent } from '../../events.js';
import type { SessionStore, Session } from '../../sessions/store.js';
import { getExternalMessageId, toSdkAssistantMessageInfo, toSdkMessageInfo, toSdkSession, toSdkSessionStatus } from './mappers.js';
import type { SdkGlobalEvent } from './types.js';

const initializedTextParts = new Set<string>();
const initializedReasoningParts = new Set<string>();
const toolNames = new Map<string, string>();

function partKey(sessionId: string, messageId: string, suffix: string): string {
  return `${sessionId}:${messageId}:${suffix}`;
}

export function toSdkGlobalEvent(event: SseEvent, sessionStore: SessionStore): SdkGlobalEvent | SdkGlobalEvent[] | null {
  switch (event.type) {
    case 'message_updated': {
      const session = sessionStore.getSession(event.sessionId);
      if (!session) return null;
      const stored = session.messages.find((message) =>
        (message.role === 'user' || message.role === 'assistant')
        && (getExternalMessageId(message) === event.messageId || message.id === event.messageId)
      );
      if (stored) {
        return {
          type: 'message.updated',
          properties: { info: toSdkMessageInfo(session, stored) },
        };
      }
      const parent = session.messages.filter((message) => message.role === 'user').at(-1);
      return {
        type: 'message.updated',
        properties: {
          info: toSdkAssistantMessageInfo(session, event.messageId, new Date(event.timestamp).getTime(), parent ? getExternalMessageId(parent) : ''),
        },
      };
    }
    case 'text_chunk': {
      const id = `${event.messageId}-text`;
      const key = partKey(event.sessionId, event.messageId, 'text');

      // Snapshot correction: replace the entire text part instead of appending a delta
      if (event.replace) {
        if (!initializedTextParts.has(key)) {
          initializedTextParts.add(key);
        }
        return {
          type: 'message.part.updated',
          properties: {
            part: {
              id,
              sessionID: event.sessionId,
              messageID: event.messageId,
              type: 'text',
              text: event.content,
              time: { start: new Date(event.timestamp).getTime() },
            },
          },
        };
      }

      const delta: SdkGlobalEvent = {
        type: 'message.part.delta',
        properties: {
          messageID: event.messageId,
          partID: id,
          field: 'text',
          delta: event.content,
        },
      };
      if (initializedTextParts.has(key)) return delta;
      initializedTextParts.add(key);
      return [
        {
          type: 'message.part.updated',
          properties: {
            part: {
              id,
              sessionID: event.sessionId,
              messageID: event.messageId,
              type: 'text',
              text: '',
              time: { start: new Date(event.timestamp).getTime() },
            },
          },
        },
        delta,
      ];
    }
    case 'thinking': {
      const id = `${event.messageId}-reasoning`;
      const key = partKey(event.sessionId, event.messageId, 'reasoning');
      const delta: SdkGlobalEvent = {
        type: 'message.part.delta',
        properties: {
          messageID: event.messageId,
          partID: id,
          field: 'text',
          delta: event.content,
        },
      };
      if (initializedReasoningParts.has(key)) return delta;
      initializedReasoningParts.add(key);
      return [
        {
          type: 'message.part.updated',
          properties: {
            part: {
              id,
              sessionID: event.sessionId,
              messageID: event.messageId,
              type: 'reasoning',
              text: '',
              time: { start: new Date(event.timestamp).getTime() },
            },
          },
        },
        delta,
      ];
    }
    case 'tool_call': {
      const key = `${event.sessionId}:${event.messageId}:${event.toolCallId}`;
      toolNames.set(key, event.toolName);
      return {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `${event.messageId}-${event.toolCallId}`,
            sessionID: event.sessionId,
            messageID: event.messageId,
            type: 'tool',
            callID: event.toolCallId,
            tool: event.toolName,
            state: { status: 'running', input: event.input, title: event.toolName, time: { start: Date.now() } },
          },
        },
      };
    }
    case 'tool_result': {
      const key = `${event.sessionId}:${event.messageId}:${event.toolCallId}`;
      const toolName = toolNames.get(key) ?? 'tool';
      if (event.success) toolNames.delete(key);
      return {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `${event.messageId}-${event.toolCallId}`,
            sessionID: event.sessionId,
            messageID: event.messageId,
            type: 'tool',
            callID: event.toolCallId,
            tool: toolName,
            state: {
              status: event.success ? 'completed' : 'error',
              input: {},
              output: event.result,
              title: toolName,
              ...(event.success
                ? { time: { start: Date.now() - 1000, end: Date.now() } }
                : { error: event.result, time: { start: Date.now() - 1000, end: Date.now() } }),
            },
          },
        },
      };
    }
    case 'status': {
      const status = toSdkSessionStatus(event.status as Session['status']);
      return {
        type: 'session.status',
        properties: {
          sessionID: event.sessionId,
          status,
        },
      };
    }
    case 'done': {
      const session = sessionStore.getSession(event.sessionId);
      const stored = session?.messages.find((message) =>
        message.role === 'assistant'
        && (getExternalMessageId(message) === event.messageId || message.id === event.messageId)
      );
      const messageUpdated = session && stored
        ? {
            type: 'message.updated' as const,
            properties: { info: toSdkMessageInfo(session, stored) },
          }
        : null;
      const idle = {
        type: 'session.idle' as const,
        properties: { sessionID: event.sessionId },
      };
      return messageUpdated ? [messageUpdated, idle] : idle;
    }
    case 'session_name': {
      const session = sessionStore.getSession(event.sessionId);
      if (!session) return null;
      return {
        type: 'session.updated',
        properties: {
          info: toSdkSession(session),
        },
      };
    }
    case 'error': {
      return {
        type: 'session.error',
        properties: {
          sessionID: event.sessionId,
          error: {
            name: 'UnknownError',
            data: { message: event.message },
          },
        },
      };
    }
    case 'question': {
      return {
        type: 'permission.updated',
        properties: {
          id: event.questionId,
          type: 'question',
          sessionID: event.sessionId,
          messageID: event.messageId,
          title: event.question,
          time: { created: Date.now() },
          metadata: { options: event.options ?? [] },
        },
      };
    }
    case 'permission': {
      return {
        type: 'permission.updated',
        properties: {
          id: event.permissionId,
          type: event.action,
          sessionID: event.sessionId,
          messageID: event.messageId,
          title: event.resource,
          time: { created: Date.now() },
          metadata: {},
        },
      };
    }
    default:
      return null;
  }
}
