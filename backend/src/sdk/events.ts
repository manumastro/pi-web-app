/**
 * SSE Event types and Zod schemas for runtime validation
 * All events are validated using Zod before processing
 */

import { z } from 'zod';

/**
 * SSE Event Types
 */

// Text chunk event - streaming text updates
export const TextChunkEventSchema = z.object({
  type: z.literal('text_chunk'),
  sessionId: z.string(),
  messageId: z.string(),
  content: z.string(),
  timestamp: z.string().datetime(),
});

export type TextChunkEvent = z.infer<typeof TextChunkEventSchema>;

// Thinking event - AI reasoning visibility
export const ThinkingEventSchema = z.object({
  type: z.literal('thinking'),
  sessionId: z.string(),
  messageId: z.string(),
  content: z.string(),
  done: z.boolean(),
  timestamp: z.string().datetime(),
});

export type ThinkingEvent = z.infer<typeof ThinkingEventSchema>;

// Tool call event - AI invoking a tool
export const ToolCallEventSchema = z.object({
  type: z.literal('tool_call'),
  sessionId: z.string(),
  messageId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});

export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;

// Tool result event - Tool execution completed
export const ToolResultEventSchema = z.object({
  type: z.literal('tool_result'),
  sessionId: z.string(),
  messageId: z.string(),
  toolCallId: z.string(),
  result: z.string(),
  success: z.boolean(),
  timestamp: z.string().datetime(),
});

export type ToolResultEvent = z.infer<typeof ToolResultEventSchema>;

// Question event - AI asking user a question
export const QuestionEventSchema = z.object({
  type: z.literal('question'),
  sessionId: z.string(),
  messageId: z.string(),
  questionId: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional(),
  timestamp: z.string().datetime(),
});

export type QuestionEvent = z.infer<typeof QuestionEventSchema>;

// Permission event - AI requesting permission
export const PermissionEventSchema = z.object({
  type: z.literal('permission'),
  sessionId: z.string(),
  messageId: z.string(),
  permissionId: z.string(),
  action: z.string(),
  resource: z.string(),
  timestamp: z.string().datetime(),
});

export type PermissionEvent = z.infer<typeof PermissionEventSchema>;

// Error event - Something went wrong
export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  sessionId: z.string(),
  message: z.string(),
  category: z.enum(['network', 'auth', 'provider', 'sdk', 'unknown']),
  recoverable: z.boolean(),
  timestamp: z.string().datetime(),
});

export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

// Done event - Response completed
export const DoneEventSchema = z.object({
  type: z.literal('done'),
  sessionId: z.string(),
  messageId: z.string(),
  aborted: z.boolean(),
  timestamp: z.string().datetime(),
});

export type DoneEvent = z.infer<typeof DoneEventSchema>;

// Session end event - Session has ended
export const SessionEndEventSchema = z.object({
  type: z.literal('session_end'),
  sessionId: z.string(),
  timestamp: z.string().datetime(),
});

export type SessionEndEvent = z.infer<typeof SessionEndEventSchema>;

// Union of all SSE event types
export const SseEventSchema = z.discriminatedUnion('type', [
  TextChunkEventSchema,
  ThinkingEventSchema,
  ToolCallEventSchema,
  ToolResultEventSchema,
  QuestionEventSchema,
  PermissionEventSchema,
  ErrorEventSchema,
  DoneEventSchema,
  SessionEndEventSchema,
]);

export type SseEvent = z.infer<typeof SseEventSchema>;
