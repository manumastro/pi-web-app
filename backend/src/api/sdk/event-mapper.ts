import type { SseEvent } from '../../events.js';
import type { SessionStore, Session } from '../../sessions/store.js';
import { toSdkSession, toSdkSessionStatus } from './mappers.js';
import type { SdkGlobalEvent } from './types.js';

export function toSdkGlobalEvent(event: SseEvent, sessionStore: SessionStore): SdkGlobalEvent | null {
  switch (event.type) {
    case 'text_chunk': {
      return {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `${event.messageId}-text`,
            sessionID: event.sessionId,
            messageID: event.messageId,
            type: 'text',
            text: event.content,
          },
          delta: event.content,
        },
      };
    }
    case 'thinking': {
      return {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `${event.messageId}-reasoning`,
            sessionID: event.sessionId,
            messageID: event.messageId,
            type: 'reasoning',
            text: event.content,
            time: { start: Date.now() },
          },
          delta: event.content,
        },
      };
    }
    case 'tool_call': {
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
            state: { status: 'running', input: event.input, time: { start: Date.now() } },
          },
        },
      };
    }
    case 'tool_result': {
      return {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `${event.messageId}-${event.toolCallId}`,
            sessionID: event.sessionId,
            messageID: event.messageId,
            type: 'tool',
            callID: event.toolCallId,
            tool: '',
            state: {
              status: event.success ? 'completed' : 'error',
              input: {},
              output: event.result,
              title: '',
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
      return {
        type: 'session.idle',
        properties: { sessionID: event.sessionId },
      };
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
