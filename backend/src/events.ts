/**
 * Event types and Zod schemas for runtime validation.
 * All events are validated using Zod before processing.
 */

import { z } from 'zod';

export const TextChunkEventSchema = z.object({
  type: z.literal('text_chunk'),
  sessionId: z.string(),
  messageId: z.string(),
  content: z.string(),
  timestamp: z.string().datetime(),
});
export type TextChunkEvent = z.infer<typeof TextChunkEventSchema>;

export const ThinkingEventSchema = z.object({
  type: z.literal('thinking'),
  sessionId: z.string(),
  messageId: z.string(),
  content: z.string(),
  done: z.boolean(),
  timestamp: z.string().datetime(),
});
export type ThinkingEvent = z.infer<typeof ThinkingEventSchema>;

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

export const StatusEventSchema = z.object({
  type: z.literal('status'),
  sessionId: z.string(),
  status: z.string(),
  message: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});
export type StatusEvent = z.infer<typeof StatusEventSchema>;

export const SessionNameEventSchema = z.object({
  type: z.literal('session_name'),
  sessionId: z.string(),
  sessionName: z.string(),
  timestamp: z.string().datetime(),
});
export type SessionNameEvent = z.infer<typeof SessionNameEventSchema>;

export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  sessionId: z.string(),
  message: z.string(),
  category: z.enum(['network', 'auth', 'provider', 'runner', 'unknown']),
  recoverable: z.boolean(),
  timestamp: z.string().datetime(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export const DoneEventSchema = z.object({
  type: z.literal('done'),
  sessionId: z.string(),
  messageId: z.string(),
  aborted: z.boolean(),
  timestamp: z.string().datetime(),
});
export type DoneEvent = z.infer<typeof DoneEventSchema>;

export const SseEventSchema = z.discriminatedUnion('type', [
  TextChunkEventSchema,
  ThinkingEventSchema,
  ToolCallEventSchema,
  ToolResultEventSchema,
  QuestionEventSchema,
  PermissionEventSchema,
  StatusEventSchema,
  SessionNameEventSchema,
  ErrorEventSchema,
  DoneEventSchema,
]);

export type SseEvent = z.infer<typeof SseEventSchema>;

export function parseSseEvent(input: unknown): SseEvent {
  return SseEventSchema.parse(input);
}
