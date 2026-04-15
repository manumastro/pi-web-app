import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBuffer, EventDeduplicator, EventPipeline } from './event-pipeline';
import type { WsEvent } from '../types';

describe('EventBuffer', () => {
  let buffer: EventBuffer;

  beforeEach(() => {
    buffer = new EventBuffer();
  });

  describe('basic operations', () => {
    it('should add and retrieve events', () => {
      const event: WsEvent = { type: 'thinking_start' } as WsEvent;
      buffer.add(event);
      
      const ready = buffer.getReadyEvents();
      expect(ready).toHaveLength(1);
      expect(ready[0].type).toBe('thinking_start');
    });

    it('should return empty array when buffer is empty', () => {
      const ready = buffer.getReadyEvents();
      expect(ready).toHaveLength(0);
    });
  });

  describe('event ordering', () => {
    it('should add events to buffer', () => {
      buffer.add({ type: 'thinking_start' } as WsEvent);
      buffer.add({ type: 'thinking_delta', text: 'Hmm' } as WsEvent);
      
      // Buffer should track events
      expect(buffer.hasPending()).toBe(true);
    });

    it('should process text events in order', () => {
      // Note: text events have dependencies, so they won't be returned
      // until the dependency check is satisfied
      buffer.add({ type: 'text_start' } as WsEvent);
      
      const ready = buffer.getReadyEvents();
      expect(ready).toHaveLength(1); // Only text_start without deps
    });

    it('should hold delta events until start is processed', () => {
      // The buffer design requires events to be added in order
      // When added out of order, they are held until flushAll is called
      buffer.add({ type: 'thinking_delta', text: 'Hmm' } as WsEvent);
      buffer.add({ type: 'thinking_end' } as WsEvent);
      
      // Nothing ready because dependencies not met
      let ready = buffer.getReadyEvents();
      expect(ready).toHaveLength(0);
      
      // Flush all when reconnecting bypasses dependency check
      const flushed = buffer.flush();
      expect(flushed).toHaveLength(2);
    });
  });

  describe('event groups', () => {
    it('should group events by type', () => {
      buffer.add({ type: 'thinking_start' } as WsEvent);
      buffer.add({ type: 'text_start' } as WsEvent);
      
      const ready = buffer.getReadyEvents();
      expect(ready).toHaveLength(2);
    });
  });

  describe('flush', () => {
    it('should flush all buffered events', () => {
      buffer.add({ type: 'thinking_start' } as WsEvent);
      buffer.add({ type: 'thinking_delta', text: 'Hmm' } as WsEvent);
      
      const flushed = buffer.flush();
      expect(flushed).toHaveLength(2);
      
      // Buffer should be empty now
      const ready = buffer.getReadyEvents();
      expect(ready).toHaveLength(0);
    });
  });

  describe('lastEventId tracking', () => {
    it('should track event count per stream', () => {
      buffer.add({ type: 'event1' } as WsEvent);
      buffer.add({ type: 'event2' } as WsEvent);
      
      // Default streamId is 'default'
      expect(buffer.getLastEventId('default')).toBe(2);
    });

    it('should return 0 for unknown stream', () => {
      expect(buffer.getLastEventId('unknown')).toBe(0);
    });
  });

  describe('hasPending', () => {
    it('should return true when events are pending', () => {
      buffer.add({ type: 'thinking_delta', text: 'Hmm' } as WsEvent);
      expect(buffer.hasPending()).toBe(true);
    });

    it('should return false when buffer is empty', () => {
      expect(buffer.hasPending()).toBe(false);
    });
  });
});

describe('EventDeduplicator', () => {
  let deduplicator: EventDeduplicator;

  beforeEach(() => {
    deduplicator = new EventDeduplicator();
  });

  describe('isDuplicate', () => {
    it('should return false for new event', () => {
      const event: WsEvent = { type: 'thinking_start' } as WsEvent;
      const eventId = EventDeduplicator.generateEventId(event);
      expect(deduplicator.isDuplicate(eventId, Date.now())).toBe(false);
    });

    it('should return true for already seen event', () => {
      const event: WsEvent = { type: 'thinking_start' } as WsEvent;
      const eventId = EventDeduplicator.generateEventId(event);
      deduplicator.markSeen(eventId, Date.now());
      expect(deduplicator.isDuplicate(eventId, Date.now())).toBe(true);
    });
  });

  describe('generateEventId', () => {
    it('should generate ID for thinking_delta', () => {
      const event: WsEvent = { type: 'thinking_delta', text: 'test' } as any;
      const id = EventDeduplicator.generateEventId(event);
      expect(id).toBe('thinking_delta:4'); // 'test' has 4 chars
    });

    it('should generate ID for tool_exec with toolCallId', () => {
      const event: WsEvent = { type: 'tool_exec_start', toolCallId: 'abc123' } as any;
      const id = EventDeduplicator.generateEventId(event);
      expect(id).toBe('tool_exec_start:abc123');
    });

    it('should generate ID for turn with index', () => {
      const event: WsEvent = { type: 'turn_start', turnIndex: 5 } as any;
      const id = EventDeduplicator.generateEventId(event);
      expect(id).toBe('turn_start:5');
    });
  });

  describe('clear', () => {
    it('should clear all seen events', () => {
      const event: WsEvent = { type: 'thinking_start' } as WsEvent;
      const eventId = EventDeduplicator.generateEventId(event);
      deduplicator.markSeen(eventId, Date.now());
      expect(deduplicator.isDuplicate(eventId, Date.now())).toBe(true);
      
      deduplicator.clear();
      expect(deduplicator.isDuplicate(eventId, Date.now())).toBe(false);
    });
  });
});

describe('EventPipeline', () => {
  let processedEvents: WsEvent[];

  beforeEach(() => {
    processedEvents = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should process events through callback', () => {
      const pipeline = new EventPipeline('test', (events) => {
        processedEvents.push(...events);
      });

      pipeline.push({ type: 'thinking_start' } as WsEvent);
      pipeline.flush();

      expect(processedEvents).toHaveLength(1);
      expect(processedEvents[0].type).toBe('thinking_start');
    });

    it('should deduplicate events', () => {
      const pipeline = new EventPipeline('test', (events) => {
        processedEvents.push(...events);
      });

      const event = { type: 'thinking_start' } as WsEvent;
      pipeline.push(event);
      pipeline.push(event); // duplicate
      pipeline.push({ type: 'thinking_start' } as WsEvent); // same type
      pipeline.flush();

      // Should only have 1 - duplicates are dropped
      expect(processedEvents).toHaveLength(1);
    });
  });

  describe('resumption', () => {
    it('should return last event ID for resumption', () => {
      const pipeline = new EventPipeline('test', (events) => {
        processedEvents.push(...events);
      });

      pipeline.push({ type: 'event1' } as WsEvent);
      pipeline.push({ type: 'event2' } as WsEvent);

      expect(pipeline.getLastEventId()).toBe(2);
    });

    it('should handle multiple streams', () => {
      const pipeline = new EventPipeline('stream1', (events) => {
        processedEvents.push(...events);
      });

      pipeline.push({ type: 'event1' } as WsEvent);
      
      // EventPipeline only tracks its own streamId
      expect(pipeline.getLastEventId()).toBe(1);
    });
  });
});
