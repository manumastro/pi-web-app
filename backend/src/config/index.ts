/**
 * Configuration module for Pi Web Backend
 * Single source of truth for all configuration values
 */

import * as path from 'path';
import * as crypto from 'crypto';

export interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  homeDir: string;
  sessionsDir: string;
  sdkCwd: string;
  model: string;
  corsOrigins: string[];
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  sessionIdPrefix: string;
  generateSessionId: () => string;
}

const VALID_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
const DEFAULT_PORT = 3210;
const DEFAULT_NODE_ENV = 'development';
const DEFAULT_SESSIONS_DIR = '.pi/agent/sessions';
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_SESSION_ID_PREFIX = 'session';

function getHomeDir(): string {
  return process.env.HOME ?? '/home/manu';
}

function getDefaultSessionsDir(): string {
  return path.join(getHomeDir(), DEFAULT_SESSIONS_DIR);
}

function getDefaultSdkCwd(): string {
  return getHomeDir();
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }
  const port = parseInt(value, 10);
  if (isNaN(port)) {
    throw new Error(`Invalid PORT: must be a number, got "${value}"`);
  }
  return port;
}

function parseNodeEnv(value: string | undefined): 'development' | 'production' | 'test' {
  if (value === undefined) {
    return DEFAULT_NODE_ENV;
  }
  if (value === 'development' || value === 'production' || value === 'test') {
    return value;
  }
  return DEFAULT_NODE_ENV;
}

function parseLogLevel(value: string | undefined): 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' {
  if (value === undefined) {
    return DEFAULT_LOG_LEVEL;
  }
  if (!VALID_LOG_LEVELS.includes(value as typeof VALID_LOG_LEVELS[number])) {
    throw new Error(`Invalid LOG_LEVEL: must be one of ${VALID_LOG_LEVELS.join(', ')}, got "${value}"`);
  }
  return value as typeof VALID_LOG_LEVELS[number];
}

function parseCorsOrigins(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(6).toString('base64url');
  return `${DEFAULT_SESSION_ID_PREFIX}_${timestamp}_${randomPart}`;
}

/**
 * Load configuration from environment variables with sensible defaults
 */
export function loadConfig(): Config {
  const port = parsePort(process.env.PORT);
  const nodeEnv = parseNodeEnv(process.env.NODE_ENV);
  const homeDir = getHomeDir();
  const sessionsDir = process.env.SESSIONS_DIR ?? getDefaultSessionsDir();
  const sdkCwd = process.env.SDK_CWD ?? getDefaultSdkCwd();
  const model = process.env.SDK_MODEL ?? 'claude-3-5-sonnet-20241022';
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
  const logLevel = parseLogLevel(process.env.LOG_LEVEL);

  return {
    port,
    nodeEnv,
    homeDir,
    sessionsDir,
    sdkCwd,
    model,
    corsOrigins,
    logLevel,
    sessionIdPrefix: DEFAULT_SESSION_ID_PREFIX,
    generateSessionId,
  };
}
