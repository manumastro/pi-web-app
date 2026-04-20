import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// We import config after mocking dotenv
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
    // Clear require cache to allow re-import
    vi.resetModules();
  });

  describe('loadConfig', () => {
    it('should return config with default values when env vars are missing', async () => {
      // Ensure no env vars are set
      delete process.env.PORT;
      delete process.env.NODE_ENV;
      delete process.env.SESSIONS_DIR;
      delete process.env.SDK_CWD;
      delete process.env.SDK_MODEL;
      delete process.env.CORS_ORIGINS;
      delete process.env.LOG_LEVEL;

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.port).toBe(3210);
      expect(config.nodeEnv).toBe('development');
      expect(config.homeDir).toBe(process.env.HOME ?? '/home/manu');
      expect(config.sessionsDir).toBe(path.join(process.env.HOME ?? '/home/manu', '.pi/agent/sessions'));
      expect(config.sdkCwd).toBe(process.env.HOME ?? '/home/manu');
      expect(config.logLevel).toBe('info');
    });

    it('should use provided env vars when set', async () => {
      process.env.PORT = '4000';
      process.env.NODE_ENV = 'production';
      process.env.SESSIONS_DIR = '/custom/sessions';
      process.env.SDK_CWD = '/custom/cwd';
      process.env.SDK_MODEL = 'gpt-4';
      process.env.CORS_ORIGINS = 'http://example.com,https://app.example.com';
      process.env.LOG_LEVEL = 'debug';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.port).toBe(4000);
      expect(config.nodeEnv).toBe('production');
      expect(config.sessionsDir).toBe('/custom/sessions');
      expect(config.sdkCwd).toBe('/custom/cwd');
      expect(config.model).toBe('gpt-4');
      expect(config.corsOrigins).toEqual(['http://example.com', 'https://app.example.com']);
      expect(config.logLevel).toBe('debug');
    });

    it('should parse CORS_ORIGINS as comma-separated array', async () => {
      process.env.CORS_ORIGINS = 'http://localhost:3000, http://localhost:8080 ,https://example.com';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.corsOrigins).toEqual([
        'http://localhost:3000',
        'http://localhost:8080',
        'https://example.com',
      ]);
    });

    it('should throw error for invalid PORT', async () => {
      process.env.PORT = 'not-a-number';

      const { loadConfig } = await import('./index.js');

      expect(() => loadConfig()).toThrow('Invalid PORT: must be a number');
    });

    it('should throw error for invalid LOG_LEVEL', async () => {
      process.env.LOG_LEVEL = 'invalid';

      const { loadConfig } = await import('./index.js');

      expect(() => loadConfig()).toThrow('Invalid LOG_LEVEL: must be one of');
    });

    it('should provide default session ID format', async () => {
      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.sessionIdPrefix).toBe('session');
      expect(typeof config.generateSessionId).toBe('function');
    });
  });

  describe('config object shape', () => {
    it('should have all required fields', async () => {
      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('nodeEnv');
      expect(config).toHaveProperty('homeDir');
      expect(config).toHaveProperty('sessionsDir');
      expect(config).toHaveProperty('sdkCwd');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('corsOrigins');
      expect(config).toHaveProperty('logLevel');
      expect(config).toHaveProperty('sessionIdPrefix');
      expect(config).toHaveProperty('generateSessionId');
    });
  });
});
