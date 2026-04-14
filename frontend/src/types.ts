// ── API Types ──
export interface CwdInfo {
  path: string;
  label: string;
  sessionCount: number;
}

export interface SessionInfo {
  id: string;
  cwd: string;
  cwdLabel: string;
  createdAt: string;
  name: string | null;
  messageCount: number;
  lastMessage: string | null;
  lastMessageType: string | null;
  model: string | null;
}

export interface SessionStats {
  sessionId: string;
  sessionFile: string;
  messages: number;
  model: string;
  thinkingLevel: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokensBefore: number;
  contextUsage: number;
  contextWindow: number;
}

export interface SessionContent {
  id: string;
  cwd: string;
  messages: SessionEntry[];
}

export interface SessionEntry {
  type: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string; thinking?: string; data?: string; mimeType?: string }>;
    model?: string;
  };
}

// Extended model info for UI display
export interface ModelInfo {
  id: string;
  name?: string;
  provider: string;
  reasoning?: boolean;
  input?: string[];  // ['text'] or ['text', 'image']
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input: number;
    output: number;
  };
}

// ── WebSocket Events (Server → Client) ──
export type WsEvent =
  | { type: 'state'; model?: string; provider?: string; thinkingLevel?: string; messages: number; sessionId?: string; sessionFile?: string; isWorking: boolean; cwd?: string }
  | { type: 'model_info'; model: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; text: string }
  | { type: 'thinking_end' }
  | { type: 'text_start' }
  | { type: 'text_delta'; text: string }
  | { type: 'text_end' }
  | { type: 'toolcall_start'; tool: string }
  | { type: 'toolcall_delta'; text: string }
  | { type: 'toolcall_end'; tool: string }
  | { type: 'tool_exec_start'; tool: string; args?: any; toolCallId?: string }
  | { type: 'tool_exec_update'; tool: string; text: string; toolCallId?: string }
  | { type: 'tool_exec_end'; tool: string; isError: boolean; result?: any; toolCallId?: string }
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages?: any[] }
  | { type: 'done'; messages?: any[] }
  | { type: 'turn_start'; model?: string }
  | { type: 'turn_end'; message?: any; toolResults?: any[] }
  | { type: 'message_start'; message?: any }
  | { type: 'message_end'; message?: any }
  | { type: 'compaction_start'; reason?: string }
  | { type: 'compaction_end'; reason?: string; aborted?: boolean; willRetry?: boolean; summary?: string }
  | { type: 'auto_retry_start'; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: 'auto_retry_end'; success: boolean; attempt: number; finalError?: string }
  | { type: 'queue_update'; steering: any[]; followUp: any[] }
  | { type: 'error'; message: string }
  | { type: 'rpc_error'; command: string; error: string }
  | { type: 'rpc_info'; info: string; message: string }
  | { type: 'rpc_response'; command: string; data: any }
  | { type: 'extension_error'; extensionPath: string; event: string; error: string }
  | { type: 'server_log'; level: 'info' | 'error'; message: string }
  | { type: 'session_created'; sessionId: string; sessionFile: string }
  | { type: 'session_loaded'; sessionId: string; sessionFile: string }
  | { type: 'session_switched'; sessionId: string }
  | { type: 'session_forked'; sessionId: string };

// ── WebSocket Commands (Client → Server) ──
export type WsCommand = {
  type: string;
  cwd?: string;
  [key: string]: any;
};
