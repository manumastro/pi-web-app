import type { SessionInfo, SessionMessage } from '@/types';

export type SyncStateStatus = 'loading' | 'partial' | 'complete';

export interface SyncSessionStatus {
  type: string;
  timestamp?: number;
  message?: string;
  needsAttention?: boolean;
  metadata?: Record<string, unknown>;
}

export type SyncDirectoryState = {
  status: SyncStateStatus;
  session: SessionInfo[];
  session_status: Record<string, SyncSessionStatus>;
  message: Record<string, SessionMessage[]>;
  session_diff: Record<string, unknown[]>;
  todo: Record<string, unknown[]>;
  permission: Record<string, unknown[]>;
  question: Record<string, unknown[]>;
  mcp: Record<string, unknown>;
  lsp: unknown[];
  vcs: unknown;
  limit: number;
};

export type SyncGlobalState = {
  ready: boolean;
  error?: { type: 'init'; message: string };
  reload: undefined | 'pending' | 'complete';
  directories: string[];
  sessionsByDirectory: Record<string, SessionInfo[]>;
};

export const SYNC_STATE_LOADING: SyncStateStatus = 'loading';

export const INITIAL_SYNC_DIRECTORY_STATE: SyncDirectoryState = {
  status: 'loading',
  session: [],
  session_status: {},
  message: {},
  session_diff: {},
  todo: {},
  permission: {},
  question: {},
  mcp: {},
  lsp: [],
  vcs: undefined,
  limit: 5,
};

export const INITIAL_SYNC_GLOBAL_STATE: SyncGlobalState = {
  ready: false,
  reload: undefined,
  directories: [],
  sessionsByDirectory: {},
};
