import { describe, it, expect } from 'vitest';
import { SseEventSchema, TextChunkEventSchema, ThinkingEventSchema, ToolCallEventSchema, ToolResultEventSchema, QuestionEventSchema, ErrorEventSchema, DoneEventSchema, type SseEvent } from './events.js';

describe('events', () => {
  describe('SseEventSchema', () => {
    it('should parse valid text_chunk event', () => {
      const input = {
        type: 'text_chunk',
        sessionId: 'session_123',
        messageId: 'msg_456',
        content: 'Hello, world!',
        timestamp: '2026-04-15T10:00:00Z',
      };

      const result = SseEventSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('text_chunk');
        expect(result.data.content).toBe('Hello, world!');
      }
    });

    it('should parse valid thinking event', () => {
      const input = {
        type: 'thinking',
        sessionId: 'session_123',
        messageId: 'msg_456',
        content: 'Let me think about this...',
        done: false,
        timestamp: '2026-04-15T10:00:00Z',
      };

      const result = SseEventSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('thinking');
        expect(result.data.done).toBe(false);
      }
    });

    it('should parse valid tool_call event', () => {
      const input = {
        type: 'tool_call',
        sessionId: 'session_123',
        messageId: 'msg_456',
        toolCallId: 'tool_789',
        toolName: 'read_file',
        input: { path: 'test.txt' },
        timestamp: '2026-04-15T10:00:00Z',
      };

      const result = SseEventSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('tool_call');
        expect(result.data.toolName).toBe('read_file');
      }
    });

    it('should parse valid question event', () => {
      const input = {
        type: 'question',
        sessionId: 'session_123',
        messageId: 'msg_456',
        questionId: 'q_001',
        question: 'Which file should I edit?',
        options: ['file1.txt', 'file2.txt'],
        timestamp: '2026-04-15T10:00:00Z',
      };

      const result = SseEventSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('question');
        expect(result.data.options).toHaveLength(2);
      }
    });

    it('should parse valid error event', () => {
      const input = {
        type: 'error',
        sessionId: 'session_123',
        message: 'Something went wrong',
        category: 'sdk',
        recoverable: true,
        timestamp: '2026-04-15T10:00:00Z',
      };

      const result = SseEventSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('error');
        expect(result.data.category).toBe('sdk');
        expect(result.data.recoverable).toBe(true);
      }
    });

    it('should parse valid done event', () => {
      const input = {
        type: 'done',
        sessionId: 'session_123',
        messageId: 'msg_456',
        aborted: false,
        timestamp: '2026-04-15T10:00:00Z',
      };

      const result = SseEventSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('done');
        expect(result.data.aborted).toBe(false);
      }
    });

    it('should reject invalid event type', () => {
      const input = {
        type: 'invalid_type',
        sessionId: 'session_123',
        timestamp: '2026-04-15T10:00:00Z',
      };

      const result = SseEventSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject event missing required fields', () => {
      const input = {
        type: 'text_chunk',
        // missing sessionId, messageId, content, timestamp
      };

      const result = SseEventSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject invalid timestamp format', () => {
      const input = {
        type: 'text_chunk',
        sessionId: 'session_123',
        messageId: 'msg_456',
        content: 'Hello',
        timestamp: 'not-a-timestamp',
      };

      const result = SseEventSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('Individual Schemas', () => {
    it('TextChunkEventSchema should validate correctly', () => {
      const valid = {
        type: 'text_chunk',
        sessionId: 's1',
        messageId: 'm1',
        content: 'Hi',
        timestamp: '2026-04-15T10:00:00Z',
      };

      const invalid = {
        type: 'text_chunk',
        sessionId: 's1',
        messageId: 'm1',
        // missing content
        timestamp: '2026-04-15T10:00:00Z',
      };

      expect(TextChunkEventSchema.safeParse(valid).success).toBe(true);
      expect(TextChunkEventSchema.safeParse(invalid).success).toBe(false);
    });

    it('ThinkingEventSchema should validate done field', () => {
      const valid = {
        type: 'thinking',
        sessionId: 's1',
        messageId: 'm1',
        content: 'thinking...',
        done: true,
        timestamp: '2026-04-15T10:00:00Z',
      };

      expect(ThinkingEventSchema.safeParse(valid).success).toBe(true);
    });

    it('ToolCallEventSchema should validate tool metadata', () => {
      const valid = {
        type: 'tool_call',
        sessionId: 's1',
        messageId: 'm1',
        toolCallId: 't1',
        toolName: 'bash',
        input: { command: 'ls -la' },
        timestamp: '2026-04-15T10:00:00Z',
      };

      const result = ToolCallEventSchema.safeParse(valid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.toolName).toBe('bash');
      }
    });

    it('ErrorEventSchema should validate error categories', () => {
      const categories = ['network', 'auth', 'provider', 'sdk', 'unknown'];

      for (const category of categories) {
        const valid = {
          type: 'error',
          sessionId: 's1',
          message: 'Error occurred',
          category,
          recoverable: true,
          timestamp: '2026-04-15T10:00:00Z',
        };

        expect(ErrorEventSchema.safeParse(valid).success).toBe(true);
      }
    });

    it('DoneEventSchema should validate aborted flag', () => {
      const aborted = {
        type: 'done',
        sessionId: 's1',
        messageId: 'm1',
        aborted: true,
        timestamp: '2026-04-15T10:00:00Z',
      };

      const completed = {
        type: 'done',
        sessionId: 's1',
        messageId: 'm1',
        aborted: false,
        timestamp: '2026-04-15T10:00:00Z',
      };

      expect(DoneEventSchema.safeParse(aborted).success).toBe(true);
      expect(DoneEventSchema.safeParse(completed).success).toBe(true);
    });
  });

  describe('Event type guard', () => {
    it('should identify valid SseEvent types by type field', () => {
      // Test that type discriminator works
      const eventTypes = [
        { type: 'text_chunk', sessionId: 's1', messageId: 'm1', content: 'hi', timestamp: '2026-04-15T10:00:00Z' },
        { type: 'thinking', sessionId: 's1', messageId: 'm1', content: 'hi', done: false, timestamp: '2026-04-15T10:00:00Z' },
        { type: 'tool_call', sessionId: 's1', messageId: 'm1', toolCallId: 't1', toolName: 'bash', input: {}, timestamp: '2026-04-15T10:00:00Z' },
        { type: 'tool_result', sessionId: 's1', messageId: 'm1', toolCallId: 't1', result: 'ok', success: true, timestamp: '2026-04-15T10:00:00Z' },
        { type: 'question', sessionId: 's1', messageId: 'm1', questionId: 'q1', question: '?', timestamp: '2026-04-15T10:00:00Z' },
        { type: 'permission', sessionId: 's1', messageId: 'm1', permissionId: 'p1', action: 'read', resource: '/', timestamp: '2026-04-15T10:00:00Z' },
        { type: 'error', sessionId: 's1', message: 'err', category: 'sdk', recoverable: true, timestamp: '2026-04-15T10:00:00Z' },
        { type: 'done', sessionId: 's1', messageId: 'm1', aborted: false, timestamp: '2026-04-15T10:00:00Z' },
        { type: 'session_end', sessionId: 's1', timestamp: '2026-04-15T10:00:00Z' },
      ];

      for (const event of eventTypes) {
        const result = SseEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });
  });
});
