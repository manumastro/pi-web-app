// ── Shared TypeScript Types ──

// Agent Session Event types (from SDK)
export type AgentSessionEventType =
  | "message_update"
  | "tool_execution_start"
  | "tool_execution_update"
  | "tool_execution_end"
  | "agent_start"
  | "agent_end"
  | "turn_start"
  | "turn_end"
  | "message_start"
  | "message_end"
  | "compaction_start"
  | "compaction_end"
  | "auto_retry_start"
  | "auto_retry_end"
  | "queue_update"
  | "error";

export interface AgentSessionEvent {
  type: AgentSessionEventType;
  [key: string]: any;
}

// CwdSession interface
export interface CwdSession {
  cwd: string;
  session: any; // AgentSession
  clients: Set<any>; // Set<WebSocket>
  unsubscribe: (() => void) | null;
  idle: boolean;
  lastPromptMsg: string | null;
  lastPromptImages: any[] | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  lastActivity: number;
  settingsManager: any;
  // State tracking
  stateVersion: number;
  workingStartTime: number | null;
  lastEventType: string | null;
}

// Session info for REST API
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
  lastModified: number;
}

// Cwd info for REST API
export interface CwdInfo {
  path: string;
  label: string;
  sessionCount: number;
}

// Session stats
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

// Error categorization
export interface ErrorInfo {
  category: string;
  isRetryable: boolean;
}

// Server log
export interface ServerLog {
  time: Date;
  level: 'info' | 'error';
  message: string;
}
