export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result' | 'toolCall' | 'toolResult';
  content: string;
  timestamp: string;
  messageId?: string;
  toolName?: string;
  toolCallId?: string;
  success?: boolean;
}

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface SessionInfo {
  id: string;
  cwd: string;
  title?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  status: string;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryInfo {
  cwd: string;
  label: string;
  sessionCount: number;
  updatedAt: string;
}

export interface ModelInfo {
  key: string;
  id: string;
  label: string;
  available: boolean;
  active: boolean;
  provider: string | undefined;
  reasoning: boolean;
}

export type StreamingState = 'idle' | 'connecting' | 'streaming' | 'error';
