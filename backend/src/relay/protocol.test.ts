import { describe, expect, it } from 'vitest';
import { parseRelayViewerMessage, serializeRelayEvent } from './protocol.js';

describe('relay protocol', () => {
  it('parses valid viewer commands', () => {
    expect(parseRelayViewerMessage(JSON.stringify({ type: 'subscribe', requestId: 'r1', sessionId: 's1' }))).toEqual({
      type: 'subscribe',
      requestId: 'r1',
      sessionId: 's1',
    });
    expect(parseRelayViewerMessage(JSON.stringify({ type: 'set_thinking_level', sessionId: 's1', thinkingLevel: 'high' }))).toEqual({
      type: 'set_thinking_level',
      sessionId: 's1',
      thinkingLevel: 'high',
    });
  });

  it('rejects invalid viewer commands', () => {
    expect(() => parseRelayViewerMessage('{bad')).toThrow();
    expect(() => parseRelayViewerMessage(JSON.stringify({ type: 'subscribe' }))).toThrow();
    expect(() => parseRelayViewerMessage(JSON.stringify({ type: 'set_thinking_level', sessionId: 's1', thinkingLevel: 'max' }))).toThrow();
  });

  it('serializes relay events', () => {
    expect(JSON.parse(serializeRelayEvent({ type: 'pong', requestId: 'r1', serverTime: 'now' }))).toEqual({
      type: 'pong',
      requestId: 'r1',
      serverTime: 'now',
    });
  });
});
