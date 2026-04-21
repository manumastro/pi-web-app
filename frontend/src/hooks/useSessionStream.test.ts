import React, { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useSessionStream } from './useSessionStream';
import type { SsePayload } from '../sync/conversation';

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  listeners = new Map<string, Set<(event: Event) => void>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, payload: SsePayload): void {
    const event = new MessageEvent(type, { data: JSON.stringify(payload) });
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  open(): void {
    this.onopen?.(new Event('open'));
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }
}

function Harness({
  sessionId,
  onPayload,
  onPayloadBatch,
  onConnected,
  onConnectionLost,
}: {
  sessionId?: string;
  onPayload: (payload: SsePayload) => void;
  onPayloadBatch?: (payloads: SsePayload[]) => void;
  onConnected: () => void;
  onConnectionLost: () => void;
}) {
  useSessionStream({ sessionId, onPayload, onPayloadBatch, onConnected, onConnectionLost });
  useEffect(() => undefined, []);
  return null;
}

describe('useSessionStream', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource as never);
    vi.useFakeTimers();
  });

  it('subscribes to session events and reconnects on errors', async () => {
    const onPayload = vi.fn();
    const onConnected = vi.fn();
    const onConnectionLost = vi.fn();

    render(
      React.createElement(Harness, {
        sessionId: 'session-1',
        onPayload,
        onConnected,
        onConnectionLost,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const instance = MockEventSource.instances[0]!;
    expect(instance.url).toContain('sessionId=session-1');

    instance.open();
    expect(onConnected).toHaveBeenCalled();

    instance.emit('text_chunk', {
      type: 'text_chunk',
      sessionId: 'session-1',
      messageId: 'm1',
      content: 'Hello',
      timestamp: '2026-04-15T10:00:00.000Z',
    });
    await vi.advanceTimersByTimeAsync(16);
    expect(onPayload).toHaveBeenCalledWith(expect.objectContaining({ type: 'text_chunk', content: 'Hello' }));

    instance.fail();
    expect(onConnectionLost).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it('batches multiple payloads arriving in the same frame', async () => {
    const onPayload = vi.fn();
    const onPayloadBatch = vi.fn();
    const onConnected = vi.fn();
    const onConnectionLost = vi.fn();

    render(
      React.createElement(Harness, {
        sessionId: 'session-1',
        onPayload,
        onPayloadBatch,
        onConnected,
        onConnectionLost,
      }),
    );

    const instance = MockEventSource.instances[0]!;
    instance.emit('text_chunk', {
      type: 'text_chunk',
      sessionId: 'session-1',
      messageId: 'm1',
      content: 'Hel',
      timestamp: '2026-04-15T10:00:00.000Z',
    });
    instance.emit('text_chunk', {
      type: 'text_chunk',
      sessionId: 'session-1',
      messageId: 'm1',
      content: 'lo',
      timestamp: '2026-04-15T10:00:00.020Z',
    });

    expect(onPayloadBatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(16);
    expect(onPayloadBatch).toHaveBeenCalledWith([
      expect.objectContaining({ content: 'Hel' }),
      expect.objectContaining({ content: 'lo' }),
    ]);
    expect(onPayload).not.toHaveBeenCalled();
  });
});
