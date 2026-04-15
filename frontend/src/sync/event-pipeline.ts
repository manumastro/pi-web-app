// ── Event Pipeline ──
// Handles event processing with buffering, ordering, and deduplication
// Inspired by OpenChamber's sync/event-pipeline.ts

import type { WsEvent } from '../types';

// ── Event Types (only those with dependencies) ──

// ── Event Order Groups ──
// Events within the same group must be processed in order
const EVENT_ORDER_GROUPS: Record<string, string[]> = {
  thinking: ['thinking_start', 'thinking_delta', 'thinking_end'],
  text: ['text_start', 'text_delta', 'text_end'],
  toolcall: ['toolcall_start', 'toolcall_delta', 'toolcall_end'],
  toolExec: ['tool_exec_start', 'tool_exec_update', 'tool_exec_end'],
  turn: ['turn_start', 'turn_end'],
  message: ['message_start', 'message_end'],
  compaction: ['compaction_start', 'compaction_end'],
  autoRetry: ['auto_retry_start', 'auto_retry_end'],
};

// ── Causal Event Dependencies ──
// Events that depend on other events being processed first
const EVENT_DEPENDENCIES: Record<string, string[]> = {
  thinking_delta: ['thinking_start'],
  thinking_end: ['thinking_start', 'thinking_delta'],
  text_delta: ['text_start'],
  text_end: ['text_start', 'text_delta'],
  toolcall_delta: ['toolcall_start'],
  toolcall_end: ['toolcall_start', 'toolcall_delta'],
  tool_exec_update: ['tool_exec_start'],
  tool_exec_end: ['tool_exec_start', 'tool_exec_update'],
  turn_end: ['turn_start'],
  message_end: ['message_start'],
  compaction_end: ['compaction_start'],
  auto_retry_end: ['auto_retry_start'],
};

// ── Event Buffer ──
// Buffers events to ensure proper ordering
export class EventBuffer {
  private buffer: Map<string, WsEvent[]> = new Map();
  private pendingDeps: Map<string, Set<string>> = new Map();
  private lastEventId: Record<string, number> = {};

  /**
   * Add an event to the buffer
   */
  add(event: WsEvent, streamId: string = 'default'): void {
    const group = this.getEventGroup(event.type);
    const key = group ? `${streamId}:${group}` : `${streamId}:${event.type}`;
    
    if (!this.buffer.has(key)) {
      this.buffer.set(key, []);
    }
    
    // Add to buffer
    this.buffer.get(key)!.push(event);
    
    // Track dependencies
    const deps = EVENT_DEPENDENCIES[event.type];
    if (deps) {
      if (!this.pendingDeps.has(key)) {
        this.pendingDeps.set(key, new Set());
      }
      deps.forEach(dep => this.pendingDeps.get(key)!.add(dep));
    }
    
    // Update last event ID for resumption
    this.lastEventId[streamId] = (this.lastEventId[streamId] || 0) + 1;
  }

  /**
   * Get events that are ready to process (dependencies satisfied)
   */
  getReadyEvents(): WsEvent[] {
    const ready: WsEvent[] = [];
    
    for (const [key, events] of this.buffer.entries()) {
      if (events.length === 0) continue;
      
      const deps = this.pendingDeps.get(key);
      if (!deps || deps.size === 0) {
        // No dependencies or all satisfied - process in order
        ready.push(...events);
        this.buffer.set(key, []);
        this.pendingDeps.delete(key);
      }
    }
    
    return ready;
  }

  /**
   * Flush all events (when reconnecting)
   */
  flush(): WsEvent[] {
    const all: WsEvent[] = [];
    for (const events of this.buffer.values()) {
      all.push(...events);
    }
    this.buffer.clear();
    this.pendingDeps.clear();
    return all;
  }

  /**
   * Get last event ID for resumption
   */
  getLastEventId(streamId: string = 'default'): number {
    return this.lastEventId[streamId] || 0;
  }

  /**
   * Check if an event type belongs to a group
   */
  private getEventGroup(type: string): string | null {
    for (const [group, types] of Object.entries(EVENT_ORDER_GROUPS)) {
      if (types.includes(type)) return group;
    }
    return null;
  }

  /**
   * Check if buffer has pending events
   */
  hasPending(): boolean {
    for (const events of this.buffer.values()) {
      if (events.length > 0) return true;
    }
    return false;
  }
}

// ── Event Deduplicator ──
// Prevents duplicate events from being processed
export class EventDeduplicator {
  private seen: Map<string, number> = new Map();
  private readonly MAX_CACHE_SIZE = 10000;

  /**
   * Check if event was already seen
   */
  isDuplicate(eventId: string, timestamp: number): boolean {
    const lastSeen = this.seen.get(eventId);
    if (lastSeen !== undefined) {
      return true;
    }
    return false;
  }

  /**
   * Mark event as seen
   */
  markSeen(eventId: string, timestamp: number): void {
    this.seen.set(eventId, timestamp);
    
    // Cleanup old entries
    if (this.seen.size > this.MAX_CACHE_SIZE) {
      const cutoff = Date.now() - 60000; // 1 minute
      for (const [id, ts] of this.seen.entries()) {
        if (ts < cutoff) {
          this.seen.delete(id);
        }
      }
    }
  }

  /**
   * Generate event ID from event data
   */
  static generateEventId(event: WsEvent): string {
    const parts: string[] = [event.type];
    
    switch (event.type) {
      case 'thinking_delta':
      case 'text_delta':
      case 'toolcall_delta':
      case 'tool_exec_update':
        parts.push(String((event as any).text?.length || 0));
        break;
      case 'tool_exec_start':
      case 'tool_exec_end':
        parts.push((event as any).toolCallId || '');
        break;
      case 'turn_start':
      case 'turn_end':
        parts.push(String((event as any).turnIndex || 0));
        break;
      case 'message_start':
      case 'message_end':
        parts.push(String((event as any).messageIndex || 0));
        break;
    }
    
    return parts.join(':');
  }

  /**
   * Clear all seen events
   */
  clear(): void {
    this.seen.clear();
  }
}

// ── Event Pipeline ──
// Orchestrates buffering, deduplication, and processing
export class EventPipeline {
  private buffer: EventBuffer;
  private deduplicator: EventDeduplicator;
  private processor: (events: WsEvent[]) => void;
  private streamId: string;
  private processingTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_DELAY_MS = 10;

  constructor(
    streamId: string,
    processor: (events: WsEvent[]) => void
  ) {
    this.streamId = streamId;
    this.buffer = new EventBuffer();
    this.deduplicator = new EventDeduplicator();
    this.processor = processor;
  }

  /**
   * Push an event into the pipeline
   */
  push(event: WsEvent): void {
    const eventId = EventDeduplicator.generateEventId(event);
    
    // Check for duplicates
    if (this.deduplicator.isDuplicate(eventId, Date.now())) {
      console.debug(`[EventPipeline:${this.streamId}] Dropping duplicate: ${event.type}`);
      return;
    }
    
    this.deduplicator.markSeen(eventId, Date.now());
    this.buffer.add(event, this.streamId);
    
    // Schedule batch processing
    this.scheduleFlush();
  }

  /**
   * Schedule a batch flush
   */
  private scheduleFlush(): void {
    if (this.processingTimeout) return;
    
    this.processingTimeout = setTimeout(() => {
      this.processingTimeout = null;
      this.flush();
    }, this.BATCH_DELAY_MS);
  }

  /**
   * Flush ready events to processor
   */
  private flush(): void {
    const ready = this.buffer.getReadyEvents();
    if (ready.length > 0) {
      this.processor(ready);
    }
  }

  /**
   * Get last event ID for resumption
   */
  getLastEventId(): number {
    return this.buffer.getLastEventId(this.streamId);
  }

  /**
   * Flush all pending events (on disconnect)
   */
  flushAll(): WsEvent[] {
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }
    return this.buffer.flush();
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.buffer.flush();
    this.deduplicator.clear();
  }
}
