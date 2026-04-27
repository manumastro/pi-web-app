import { z } from 'zod';

export const ThinkingLevelSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']);
export type RunnerThinkingLevel = z.infer<typeof ThinkingLevelSchema>;

export const ModelRefSchema = z.object({
  provider: z.string().min(1),
  id: z.string().min(1),
});
export type RunnerModelRef = z.infer<typeof ModelRefSchema>;

export const ModelInfoSchema = ModelRefSchema.extend({
  name: z.string().optional(),
  reasoning: z.boolean().optional(),
  contextWindow: z.number().optional(),
});
export type RunnerModelInfo = z.infer<typeof ModelInfoSchema>;

export const RunnerHistoryMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
  timestamp: z.string().optional(),
  messageId: z.string().optional(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
  success: z.boolean().optional(),
});
export type RunnerHistoryMessage = z.infer<typeof RunnerHistoryMessageSchema>;

const BaseCommandSchema = z.object({
  requestId: z.string().min(1),
});

export const RunnerCommandSchema = z.discriminatedUnion('type', [
  BaseCommandSchema.extend({
    type: z.literal('start_session'),
    sessionId: z.string().min(1),
    cwd: z.string().min(1),
    model: ModelRefSchema.optional(),
    thinkingLevel: ThinkingLevelSchema.optional(),
    history: z.array(RunnerHistoryMessageSchema).optional(),
  }),
  BaseCommandSchema.extend({
    type: z.literal('send_input'),
    sessionId: z.string().min(1),
    text: z.string(),
    messageId: z.string().optional(),
    deliverAs: z.enum(['input', 'steer', 'followUp']).optional(),
  }),
  BaseCommandSchema.extend({
    type: z.literal('set_model'),
    sessionId: z.string().min(1),
    model: ModelRefSchema,
  }),
  BaseCommandSchema.extend({
    type: z.literal('set_thinking_level'),
    sessionId: z.string().min(1),
    level: ThinkingLevelSchema,
  }),
  BaseCommandSchema.extend({
    type: z.literal('abort'),
    sessionId: z.string().min(1),
  }),
  BaseCommandSchema.extend({
    type: z.literal('answer_question'),
    sessionId: z.string().min(1),
    questionId: z.string().min(1),
    answer: z.string(),
  }),
  BaseCommandSchema.extend({
    type: z.literal('get_capabilities'),
    sessionId: z.string().optional(),
  }),
  BaseCommandSchema.extend({
    type: z.literal('shutdown'),
  }),
]);
export type RunnerCommand = z.infer<typeof RunnerCommandSchema>;

export const RunnerEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    runnerId: z.string(),
    pid: z.number(),
    version: z.string(),
  }),
  z.object({
    type: z.literal('command_result'),
    requestId: z.string(),
    ok: z.boolean(),
    error: z.string().optional(),
    data: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('session_active'),
    sessionId: z.string(),
    cwd: z.string(),
    model: ModelRefSchema.nullable(),
    thinkingLevel: ThinkingLevelSchema.optional(),
    availableModels: z.array(ModelInfoSchema),
    messages: z.array(RunnerHistoryMessageSchema).optional(),
  }),
  z.object({
    type: z.literal('session_metadata_update'),
    sessionId: z.string(),
    model: ModelRefSchema.nullable(),
    thinkingLevel: ThinkingLevelSchema.optional(),
    availableModels: z.array(ModelInfoSchema),
  }),
  z.object({
    type: z.literal('model_set_result'),
    sessionId: z.string(),
    requestId: z.string().optional(),
    ok: z.boolean(),
    model: ModelRefSchema.optional(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('text'),
    sessionId: z.string(),
    messageId: z.string(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('thinking'),
    sessionId: z.string(),
    messageId: z.string(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('tool_call'),
    sessionId: z.string(),
    messageId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    sessionId: z.string(),
    messageId: z.string(),
    toolCallId: z.string(),
    output: z.unknown(),
    success: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('done'),
    sessionId: z.string(),
    messageId: z.string(),
    aborted: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('question_resolved'),
    sessionId: z.string(),
    questionId: z.string(),
  }),
  z.object({
    type: z.literal('session_name'),
    sessionId: z.string(),
    sessionName: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    sessionId: z.string().optional(),
    message: z.string().optional(),
    error: z.string(),
    fatal: z.boolean().optional(),
  }),
]);
export type RunnerEvent = z.infer<typeof RunnerEventSchema>;

export function parseRunnerEventLine(line: string): RunnerEvent {
  return RunnerEventSchema.parse(JSON.parse(line));
}

export function serializeRunnerCommand(command: RunnerCommand): string {
  return `${JSON.stringify(RunnerCommandSchema.parse(command))}\n`;
}
