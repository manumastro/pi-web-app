import { describe, expect, it } from 'vitest';
import { parseRunnerEventLine, RunnerCommandSchema, serializeRunnerCommand } from './protocol.js';

describe('runner protocol', () => {
  it('serializes valid commands as JSONL', () => {
    const line = serializeRunnerCommand({
      type: 'send_input',
      requestId: 'req-1',
      sessionId: 'session-1',
      text: 'hello',
    });

    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({
      type: 'send_input',
      requestId: 'req-1',
      sessionId: 'session-1',
      text: 'hello',
    });
  });

  it('rejects invalid commands before serialization', () => {
    expect(() => serializeRunnerCommand({
      type: 'set_model',
      requestId: 'req-1',
      sessionId: 'session-1',
    } as never)).toThrow();
  });

  it('parses valid runner events', () => {
    const event = parseRunnerEventLine(JSON.stringify({
      type: 'text',
      sessionId: 'session-1',
      messageId: 'message-1',
      delta: 'chunk',
    }));

    expect(event).toEqual({
      type: 'text',
      sessionId: 'session-1',
      messageId: 'message-1',
      delta: 'chunk',
    });
  });

  it('rejects invalid JSON and invalid event shapes', () => {
    expect(() => parseRunnerEventLine('{bad json')).toThrow();
    expect(() => parseRunnerEventLine(JSON.stringify({ type: 'text', sessionId: 's' }))).toThrow();
  });

  it('accepts all command variants used by the orchestrator', () => {
    const commands = [
      { type: 'start_session', requestId: '1', sessionId: 's', cwd: '/tmp' },
      { type: 'send_input', requestId: '2', sessionId: 's', text: 'hi' },
      { type: 'set_model', requestId: '3', sessionId: 's', model: { provider: 'p', id: 'm' } },
      { type: 'set_thinking_level', requestId: '4', sessionId: 's', level: 'medium' },
      { type: 'abort', requestId: '5', sessionId: 's' },
      { type: 'get_capabilities', requestId: '6' },
      { type: 'shutdown', requestId: '7' },
    ];

    for (const command of commands) {
      expect(RunnerCommandSchema.safeParse(command).success).toBe(true);
    }
  });
});
