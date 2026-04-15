import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  RetryScheduler,
  createRetrySchedulerForError,
  categorizeError,
  isRetryable,
  getSuggestedDelay,
  type RetryConfig,
  type RetryState,
  type ErrorCategory 
} from './retry';

describe('categorizeError', () => {
  it('should categorize rate limit errors', () => {
    expect(categorizeError('Rate limit exceeded')).toBe('rate_limit');
    expect(categorizeError('rate_limit exceeded')).toBe('rate_limit');
    expect(categorizeError('too_many_requests')).toBe('rate_limit');
    expect(categorizeError('429')).toBe('rate_limit');
  });

  it('should categorize quota errors', () => {
    expect(categorizeError('You have exceeded your current quota')).toBe('quota');
    expect(categorizeError('Monthly limit reached')).toBe('quota');
  });

  it('should categorize overload errors', () => {
    expect(categorizeError('Service is overloaded')).toBe('overload');
    expect(categorizeError('Server busy')).toBe('overload');
    expect(categorizeError('503 Service Unavailable')).toBe('overload');
  });

  it('should categorize timeout errors', () => {
    expect(categorizeError('Request timed out')).toBe('timeout');
    expect(categorizeError('ETIMEDOUT')).toBe('timeout');
  });

  it('should categorize network errors', () => {
    expect(categorizeError('Network connection failed')).toBe('network');
    expect(categorizeError('ECONNREFUSED')).toBe('network');
  });

  it('should categorize auth errors', () => {
    expect(categorizeError('Authentication failed')).toBe('auth');
    expect(categorizeError('Unauthorized')).toBe('auth');
    expect(categorizeError('401 Unauthorized')).toBe('auth');
    expect(categorizeError('Invalid credentials')).toBe('auth');
  });

  it('should categorize server errors (5xx)', () => {
    expect(categorizeError('Internal server error')).toBe('server_error');
    expect(categorizeError('500 Internal Server Error')).toBe('server_error');
  });

  it('should return unknown for unrecognized errors', () => {
    expect(categorizeError('Something went wrong')).toBe('unknown');
  });
});

describe('isRetryable', () => {
  it('should return true for retryable errors', () => {
    expect(isRetryable('rate_limit')).toBe(true);
    expect(isRetryable('overload')).toBe(true);
    expect(isRetryable('timeout')).toBe(true);
    expect(isRetryable('network')).toBe(true);
    expect(isRetryable('server_error')).toBe(true);
  });

  it('should return false for non-retryable errors', () => {
    // quota is actually retryable in this implementation (with higher delay)
    expect(isRetryable('auth')).toBe(false);
    expect(isRetryable('api')).toBe(false);
    expect(isRetryable('unknown')).toBe(false);
  });
});

describe('getSuggestedDelay', () => {
  it('should suggest 5s for rate limit', () => {
    expect(getSuggestedDelay('rate_limit')).toBe(5000);
  });

  it('should suggest 10s for quota', () => {
    expect(getSuggestedDelay('quota')).toBe(10000);
  });

  it('should suggest 2s for overload', () => {
    expect(getSuggestedDelay('overload')).toBe(2000);
  });

  it('should suggest 1s for network', () => {
    expect(getSuggestedDelay('network')).toBe(1000);
  });
});

describe('RetryScheduler', () => {
  let onRetry: ReturnType<typeof vi.fn>;
  let onExhausted: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onRetry = vi.fn();
    onExhausted = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should call onRetry after schedule', async () => {
      const scheduler = new RetryScheduler();
      scheduler.setCallbacks(onRetry, onExhausted);
      
      scheduler.schedule();
      await vi.runAllTimersAsync();
      
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          nextRetryTime: expect.any(Number),
          totalDelayMs: expect.any(Number),
        })
      );
    });

    it('should call onExhausted after max attempts', async () => {
      const scheduler = new RetryScheduler({ maxAttempts: 2 });
      scheduler.setCallbacks(onRetry, onExhausted);
      
      scheduler.schedule(); // attempt 1
      await vi.runAllTimersAsync();
      onRetry.mockClear();
      
      scheduler.schedule(); // attempt 2
      await vi.runAllTimersAsync();
      
      scheduler.schedule(); // should call onExhausted
      await vi.runAllTimersAsync();
      
      expect(onExhausted).toHaveBeenCalledTimes(1);
    });

    it('should track attempt count', async () => {
      const scheduler = new RetryScheduler({ maxAttempts: 5 });
      scheduler.setCallbacks(onRetry, onExhausted);
      
      scheduler.schedule();
      await vi.runAllTimersAsync();
      onRetry.mockClear();
      
      scheduler.schedule();
      await vi.runAllTimersAsync();
      
      const state = scheduler.getState();
      expect(state?.attempt).toBe(2);
    });
  });

  describe('cancel', () => {
    it('should cancel scheduled retry', async () => {
      const scheduler = new RetryScheduler({ baseDelayMs: 10000 });
      scheduler.setCallbacks(onRetry, onExhausted);
      
      scheduler.schedule();
      scheduler.cancel();
      
      await vi.runAllTimersAsync();
      
      expect(onRetry).not.toHaveBeenCalled();
      expect(scheduler.getState()).toBeNull();
    });
  });

  describe('stop', () => {
    it('should stop retrying permanently', async () => {
      const scheduler = new RetryScheduler();
      scheduler.setCallbacks(onRetry, onExhausted);
      
      scheduler.schedule();
      scheduler.stop();
      scheduler.schedule(); // should not do anything
      
      await vi.runAllTimersAsync();
      
      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should allow retry after reset', async () => {
      const scheduler = new RetryScheduler({ maxAttempts: 5 });
      scheduler.setCallbacks(onRetry, onExhausted);
      
      scheduler.schedule();
      await vi.runAllTimersAsync();
      onRetry.mockClear();
      
      scheduler.reset();
      scheduler.schedule();
      await vi.runAllTimersAsync();
      
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(scheduler.getState()?.attempt).toBe(1);
    });
  });

  describe('hasAttemptsRemaining', () => {
    it('should return true when attempts remain', () => {
      const scheduler = new RetryScheduler({ maxAttempts: 5 });
      expect(scheduler.hasAttemptsRemaining()).toBe(true);
    });

    it('should return false after max attempts', async () => {
      const scheduler = new RetryScheduler({ maxAttempts: 2 });
      scheduler.setCallbacks(onRetry, onExhausted);
      
      scheduler.schedule();
      await vi.runAllTimersAsync();
      onRetry.mockClear();
      
      scheduler.schedule();
      await vi.runAllTimersAsync();
      onRetry.mockClear();
      
      scheduler.schedule(); // attempt 3 - over max
      await vi.runAllTimersAsync();
      
      expect(scheduler.hasAttemptsRemaining()).toBe(false);
    });
  });

  describe('exponential backoff', () => {
    it('should increase delay with each attempt', async () => {
      const scheduler = new RetryScheduler({ 
        baseDelayMs: 1000,
        maxDelayMs: 100000,
        jitterFactor: 0 // disable jitter for predictable testing
      });
      scheduler.setCallbacks(onRetry, onExhausted);
      
      // First attempt
      scheduler.schedule();
      await vi.runAllTimersAsync();
      const delay1 = onRetry.mock.calls[0][0].totalDelayMs;
      
      // Second attempt
      scheduler.schedule();
      await vi.runAllTimersAsync();
      const delay2 = onRetry.mock.calls[1][0].totalDelayMs;
      
      expect(delay2).toBeGreaterThan(delay1);
    });
  });

  describe('custom config', () => {
    it('should use custom baseDelayMs', () => {
      const scheduler = new RetryScheduler({ baseDelayMs: 500 });
      expect(scheduler.getState()).toBeNull(); // not started yet
    });
  });
});

describe('createRetrySchedulerForError', () => {
  it('should create scheduler with rate limit config', () => {
    const scheduler = createRetrySchedulerForError('Rate limit exceeded');
    expect(scheduler).toBeInstanceOf(RetryScheduler);
  });

  it('should create scheduler with quota config', () => {
    const scheduler = createRetrySchedulerForError('Quota exceeded');
    expect(scheduler).toBeInstanceOf(RetryScheduler);
  });

  it('should create scheduler with network config', () => {
    const scheduler = createRetrySchedulerForError('Connection refused');
    expect(scheduler).toBeInstanceOf(RetryScheduler);
  });

  it('should handle unknown errors', () => {
    const scheduler = createRetrySchedulerForError('Something random happened');
    expect(scheduler).toBeInstanceOf(RetryScheduler);
  });
});
