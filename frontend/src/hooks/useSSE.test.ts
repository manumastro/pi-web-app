import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSSE } from './useSSE';

// Mock fetch
global.fetch = vi.fn();

// Mock EventSource is in setup.ts

describe('useSSE', () => {
  let onEvent: ReturnType<typeof vi.fn>;
  let onConnected: ReturnType<typeof vi.fn>;
  let onDisconnected: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onEvent = vi.fn();
    onConnected = vi.fn();
    onDisconnected = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connection management', () => {
    it('should connect to SSE endpoint', async () => {
      const { result, unmount } = renderHook(() => 
        useSSE({ 
          cwd: '/test/cwd', 
          onEvent, 
          onConnected, 
          onDisconnected 
        })
      );

      // Wait for connection
      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      expect(onConnected).toHaveBeenCalled();
      unmount();
    });

    it('should set connected to false on initial load', () => {
      const { result } = renderHook(() => 
        useSSE({ 
          cwd: '/test/cwd', 
          onEvent 
        })
      );

      expect(result.current.connected).toBe(false);
    });
  });

  describe('send command', () => {
    it('should send prompt command via REST API', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const { result, unmount } = renderHook(() => 
        useSSE({ 
          cwd: '/test/cwd', 
          onEvent 
        })
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      await result.current.send({ type: 'prompt', text: 'Hello', cwd: '/test/cwd' });

      expect(global.fetch).toHaveBeenCalled();
      expect(global.fetch.mock.calls[0][0]).toContain('prompt');
      unmount();
    });

    it('should send steer command', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true
      });

      const { result, unmount } = renderHook(() => 
        useSSE({ 
          cwd: '/test/cwd', 
          onEvent 
        })
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      await result.current.send({ type: 'steer', text: 'Stay on task', cwd: '/test/cwd' });

      expect(global.fetch).toHaveBeenCalled();
      expect(global.fetch.mock.calls[0][0]).toContain('steer');
      unmount();
    });

    it('should send abort command', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true
      });

      const { result, unmount } = renderHook(() => 
        useSSE({ 
          cwd: '/test/cwd', 
          onEvent 
        })
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      await result.current.send({ type: 'abort', cwd: '/test/cwd' });

      expect(global.fetch).toHaveBeenCalled();
      expect(global.fetch.mock.calls[0][0]).toContain('abort');
      unmount();
    });

    it('should send get_state command', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ isWorking: false, model: 'gpt-4' })
      });

      const { result, unmount } = renderHook(() => 
        useSSE({ 
          cwd: '/test/cwd', 
          onEvent 
        })
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      await result.current.send({ type: 'get_state', cwd: '/test/cwd' });

      expect(global.fetch).toHaveBeenCalled();
      expect(global.fetch.mock.calls[0][0]).toContain('state');
      expect(onEvent).toHaveBeenCalled();
      unmount();
    });

    it('should send get_session_stats command', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: 10, tokens: 1000 })
      });

      const { result, unmount } = renderHook(() => 
        useSSE({ 
          cwd: '/test/cwd', 
          onEvent 
        })
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      await result.current.send({ type: 'get_session_stats', cwd: '/test/cwd' });

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rpc_response',
          command: 'get_session_stats'
        })
      );
      unmount();
    });

    it('should send get_available_models command', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ id: 'gpt-4' }] })
      });

      const { result, unmount } = renderHook(() => 
        useSSE({ 
          cwd: '/test/cwd', 
          onEvent 
        })
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      await result.current.send({ type: 'get_available_models' });

      expect(global.fetch).toHaveBeenCalled();
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rpc_response',
          command: 'get_available_models'
        })
      );
      unmount();
    });
  });

  describe('cwd changes', () => {
    it('should reconnect when cwd changes', async () => {
      const { result, rerender, unmount } = renderHook(
        ({ cwd }: { cwd: string }) => useSSE({ cwd, onEvent }),
        { initialProps: { cwd: '/cwd1' } }
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      // Change cwd
      rerender({ cwd: '/cwd2' });

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      unmount();
    });
  });
});
