export interface SdkSession {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  version: string;
  time: { created: number; updated: number; compacting?: number };
  parentID?: string;
  summary?: { additions: number; deletions: number; files: number; diffs?: Array<Record<string, unknown>> };
  share?: { url: string };
  revert?: { messageID: string; partID?: string; snapshot?: string; diff?: string };
}

export interface SdkMessageInfo {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  time: { created: number };
  error?: unknown;
  modelID?: string;
  providerID?: string;
  mode?: string;
  cost?: number;
  tokens?: { input: number; output: number; reasoning: number; cache?: { read: number; write: number } };
}

export interface SdkPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface SdkMessageWithParts {
  info: SdkMessageInfo;
  parts: SdkPart[];
}

export interface SdkGlobalEvent {
  type: string;
  properties: Record<string, unknown>;
}
