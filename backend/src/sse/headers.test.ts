import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { setSseHeaders } from './headers.js';

function createResponseRecorder() {
  const headers = new Map<string, string | number | readonly string[]>();
  const response = {
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
  } as unknown as Response;

  return { headers, response };
}

describe('setSseHeaders', () => {
  it('sets proxy-safe event-stream headers', () => {
    const { headers, response } = createResponseRecorder();

    setSseHeaders(response);

    expect(headers.get('content-type')).toBe('text/event-stream');
    expect(headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(headers.get('connection')).toBe('keep-alive');
    expect(headers.get('x-accel-buffering')).toBe('no');
  });
});
