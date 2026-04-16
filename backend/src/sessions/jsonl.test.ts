import { describe, it, expect } from 'vitest';
import { parseJsonlToMessages, messagesToJsonl, type JsonlMessage } from './jsonl.js';

describe('jsonl', () => {
  describe('parseJsonlToMessages', () => {
    it('should parse valid JSONL lines into messages', () => {
      const input = [
        '{"type":"user","content":"Hello","timestamp":"2026-04-15T10:00:00Z"}',
        '{"type":"assistant","content":"Hi there!","timestamp":"2026-04-15T10:00:01Z"}',
      ].join('\n');

      const messages = parseJsonlToMessages(input);

      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        type: 'user',
        content: 'Hello',
        timestamp: '2026-04-15T10:00:00Z',
      });
      expect(messages[1]).toMatchObject({
        type: 'assistant',
        content: 'Hi there!',
        timestamp: '2026-04-15T10:00:01Z',
      });
    });

    it('should skip malformed JSON lines and continue parsing', () => {
      const input = [
        '{"type":"user","content":"OK","timestamp":"2026-04-15T10:00:00Z"}',
        'INVALID_JSON_LINE',
        '{"type":"assistant","content":"Got it","timestamp":"2026-04-15T10:00:01Z"}',
      ].join('\n');

      const messages = parseJsonlToMessages(input);

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('user');
      expect(messages[1].type).toBe('assistant');
    });

    it('should return empty array for empty input', () => {
      expect(parseJsonlToMessages('')).toEqual([]);
    });

    it('should return empty array for whitespace-only input', () => {
      expect(parseJsonlToMessages('   \n\n  \n')).toEqual([]);
    });

    it('should handle single valid line', () => {
      const input = '{"type":"user","content":"Hi","timestamp":"2026-04-15T10:00:00Z"}';
      const messages = parseJsonlToMessages(input);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'user',
        content: 'Hi',
      });
    });

    it('should parse tool_call type correctly', () => {
      const input = [
        '{"type":"tool_call","name":"read_file","input":{"path":"test.txt"},"timestamp":"2026-04-15T10:00:00Z"}',
      ].join('\n');

      const messages = parseJsonlToMessages(input);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'tool_call',
        name: 'read_file',
        input: { path: 'test.txt' },
      });
    });

    it('should parse tool_result type correctly', () => {
      const input = [
        '{"type":"tool_result","tool_call_id":"call_123","success":true,"content":"file contents","timestamp":"2026-04-15T10:00:00Z"}',
      ].join('\n');

      const messages = parseJsonlToMessages(input);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'tool_result',
        tool_call_id: 'call_123',
        success: true,
        content: 'file contents',
      });
    });

    it('should handle empty lines between valid JSON', () => {
      const input = [
        '{"type":"user","content":"Hello","timestamp":"2026-04-15T10:00:00Z"}',
        '',
        '{"type":"assistant","content":"Hi","timestamp":"2026-04-15T10:00:01Z"}',
        '',
      ].join('\n');

      const messages = parseJsonlToMessages(input);

      expect(messages).toHaveLength(2);
    });

    it('should handle CRLF line endings', () => {
      const input = [
        '{"type":"user","content":"Hello","timestamp":"2026-04-15T10:00:00Z"}\r\n',
        '{"type":"assistant","content":"Hi","timestamp":"2026-04-15T10:00:01Z"}\r\n',
      ].join('');

      const messages = parseJsonlToMessages(input);

      expect(messages).toHaveLength(2);
    });
  });

  describe('messagesToJsonl', () => {
    it('should convert messages to JSONL format', () => {
      const messages: JsonlMessage[] = [
        { type: 'user', content: 'Hello', timestamp: '2026-04-15T10:00:00Z' },
        { type: 'assistant', content: 'Hi!', timestamp: '2026-04-15T10:00:01Z' },
      ];

      const jsonl = messagesToJsonl(messages);
      const lines = jsonl.trim().split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toMatchObject({
        type: 'user',
        content: 'Hello',
      });
      expect(JSON.parse(lines[1])).toMatchObject({
        type: 'assistant',
        content: 'Hi!',
      });
    });

    it('should handle empty message array', () => {
      const messages: JsonlMessage[] = [];
      const jsonl = messagesToJsonl(messages);

      expect(jsonl).toBe('');
    });

    it('should include all message fields', () => {
      const messages: JsonlMessage[] = [
        {
          type: 'tool_call',
          name: 'read_file',
          input: { path: 'test.txt' },
          timestamp: '2026-04-15T10:00:00Z',
        },
      ];

      const jsonl = messagesToJsonl(messages);
      const parsed = JSON.parse(jsonl.trim());

      expect(parsed.type).toBe('tool_call');
      expect(parsed.name).toBe('read_file');
      expect(parsed.input).toEqual({ path: 'test.txt' });
    });
  });

  describe('roundtrip', () => {
    it('should preserve message data through parse -> serialize -> parse', () => {
      const original: JsonlMessage[] = [
        { type: 'user', content: 'Test with special chars: é € 🎉', timestamp: '2026-04-15T10:00:00Z' },
        { type: 'assistant', content: 'Response with "quotes"', timestamp: '2026-04-15T10:00:01Z' },
        {
          type: 'tool_call',
          name: 'complex_input',
          input: { nested: { deep: [1, 2, 3] }, quote: '"test"' },
          timestamp: '2026-04-15T10:00:02Z',
        },
      ];

      const jsonl = messagesToJsonl(original);
      const parsed = parseJsonlToMessages(jsonl);

      expect(parsed).toHaveLength(original.length);
      expect(parsed[0]).toMatchObject(original[0]);
      expect(parsed[1]).toMatchObject(original[1]);
      expect(parsed[2]).toMatchObject(original[2]);
    });
  });
});
