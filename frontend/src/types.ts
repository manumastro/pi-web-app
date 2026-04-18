export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface SessionInfo {
  id: string;
  cwd: string;
  model?: string;
  status: string;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  authRequired: boolean;
  description?: string;
  isDefault?: boolean;
}

export type StreamingState = 'idle' | 'connecting' | 'streaming' | 'error';
