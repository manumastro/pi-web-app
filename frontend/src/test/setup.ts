import { vi } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

// Mock EventSource
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  
  url: string;
  readyState: number = MockEventSource.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners: Map<string, Set<(event: MessageEvent) => void>> = new Map();

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  addEventListener(eventType: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  removeEventListener(eventType: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(eventType)?.delete(listener);
  }

  dispatchEvent(event: MessageEvent) {
    if (event.type === 'message' && this.onmessage) {
      this.onmessage(event);
    }
    this.listeners.get(event.type)?.forEach(listener => listener(event));
    return true;
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  // Helper to simulate receiving an event
  simulateEvent(eventType: string, data: object) {
    const event = new MessageEvent('message', { data: JSON.stringify(data) });
    (event as any).type = eventType;
    this.listeners.get(eventType)?.forEach(listener => listener(event));
  }
}

global.EventSource = MockEventSource as any;

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});
