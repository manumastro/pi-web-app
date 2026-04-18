export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface SessionInfo {
  id: string;
  cwd: string;
  title?: string;
  model?: string;
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
}

export type StreamingState = 'idle' | 'connecting' | 'streaming' | 'error';
