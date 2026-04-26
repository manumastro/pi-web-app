import { z } from 'zod';
import { ThinkingLevelSchema } from '../runner/protocol.js';

const BaseViewerCommandSchema = z.object({
  requestId: z.string().min(1).optional(),
});

export const RelayViewerCommandSchema = z.discriminatedUnion('type', [
  BaseViewerCommandSchema.extend({
    type: z.literal('subscribe'),
    sessionId: z.string().min(1),
  }),
  BaseViewerCommandSchema.extend({
    type: z.literal('unsubscribe'),
    sessionId: z.string().min(1),
  }),
  BaseViewerCommandSchema.extend({
    type: z.literal('list_models'),
    selectedModelKey: z.string().optional(),
  }),
  BaseViewerCommandSchema.extend({
    type: z.literal('prompt'),
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    message: z.string().min(1),
    model: z.string().optional(),
    messageId: z.string().optional(),
    thinkingLevel: ThinkingLevelSchema.optional(),
  }),
  BaseViewerCommandSchema.extend({
    type: z.literal('abort'),
    sessionId: z.string().min(1),
  }),
  BaseViewerCommandSchema.extend({
    type: z.literal('set_model'),
    sessionId: z.string().min(1),
    modelKey: z.string().min(1),
  }),
  BaseViewerCommandSchema.extend({
    type: z.literal('set_thinking_level'),
    sessionId: z.string().min(1),
    thinkingLevel: ThinkingLevelSchema,
  }),
  BaseViewerCommandSchema.extend({
    type: z.literal('get_thinking_levels'),
    sessionId: z.string().min(1),
  }),
  BaseViewerCommandSchema.extend({
    type: z.literal('ping'),
  }),
]);
export type RelayViewerCommand = z.infer<typeof RelayViewerCommandSchema>;

export type RelayEvent =
  | { type: 'hello'; viewerId: string; serverTime: string; transport: 'websocket'; protocolVersion: 1 }
  | { type: 'presence'; viewers: number; sessions: Record<string, number>; runner: { status: string } }
  | { type: 'subscribed'; sessionId: string }
  | { type: 'unsubscribed'; sessionId: string }
  | { type: 'command_result'; requestId?: string; ok: boolean; data?: unknown; error?: string }
  | { type: 'sse_event'; event: unknown }
  | { type: 'pong'; requestId?: string; serverTime: string }
  | { type: 'error'; requestId?: string; message: string; recoverable: boolean };

export function parseRelayViewerMessage(raw: string): RelayViewerCommand {
  return RelayViewerCommandSchema.parse(JSON.parse(raw));
}

export function serializeRelayEvent(event: RelayEvent): string {
  return JSON.stringify(event);
}
