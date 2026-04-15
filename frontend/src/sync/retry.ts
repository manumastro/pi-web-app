// ── Retry Logic with Exponential Backoff and Jitter ──
// Inspired by OpenChamber's sync/retry.ts
// RFC 6449 - Exponential backoff with full jitter

export interface RetryConfig {
  /** Base delay in ms (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in ms (default: 60000) */
  maxDelayMs: number;
  /** Maximum number of attempts (default: 5) */
  maxAttempts: number;
  /** Jitter factor 0-1 (default: 0.5 = 50%) */
  jitterFactor: number;
  /** Multiplier for each attempt (default: 2) */
  backoffMultiplier: number;
}

export interface RetryState {
  attempt: number;
  nextRetryTime: number;
  totalDelayMs: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  maxAttempts: 5,
  jitterFactor: 0.5,
  backoffMultiplier: 2,
};

/**
 * Calculate delay with exponential backoff and jitter
 * Uses "Full Jitter" algorithm from AWS architecture blog
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // exponential: base * multiplier^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  
  // cap at max
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  
  // full jitter: random between 0 and cappedDelay
  const jitter = Math.random() * cappedDelay * config.jitterFactor;
  
  // add jitter to delay
  return Math.floor(cappedDelay + jitter);
}

/**
 * RetryScheduler - manages retry timing with exponential backoff
 */
export class RetryScheduler {
  private config: RetryConfig;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private currentState: RetryState | null = null;
  private onRetry: ((state: RetryState) => void) | null = null;
  private onExhausted: (() => void) | null = null;
  private shouldStop: boolean = false;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callbacks
   */
  setCallbacks(onRetry: (state: RetryState) => void, onExhausted: () => void): void {
    this.onRetry = onRetry;
    this.onExhausted = onExhausted;
  }

  /**
   * Start retry schedule
   */
  schedule(): void {
    if (this.shouldStop) return;
    
    const attempt = this.currentState?.attempt || 0;
    if (attempt >= this.config.maxAttempts) {
      this.onExhausted?.();
      return;
    }

    const delay = calculateDelay(attempt, this.config);
    const nextRetryTime = Date.now() + delay;

    this.currentState = {
      attempt: attempt + 1,
      nextRetryTime,
      totalDelayMs: (this.currentState?.totalDelayMs || 0) + delay,
    };

    console.log(`[RetryScheduler] Attempt ${this.currentState.attempt}/${this.config.maxAttempts}, waiting ${delay}ms`);

    this.timeoutId = setTimeout(() => {
      if (!this.shouldStop) {
        this.onRetry?.(this.currentState!);
      }
    }, delay);
  }

  /**
   * Cancel retry schedule
   */
  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.currentState = null;
  }

  /**
   * Stop retrying permanently
   */
  stop(): void {
    this.shouldStop = true;
    this.cancel();
  }

  /**
   * Reset for new retry sequence
   */
  reset(): void {
    this.shouldStop = false;
    this.cancel();
  }

  /**
   * Get current state
   */
  getState(): RetryState | null {
    return this.currentState;
  }

  /**
   * Check if we have attempts remaining
   */
  hasAttemptsRemaining(): boolean {
    const attempt = this.currentState?.attempt || 0;
    return attempt < this.config.maxAttempts;
  }
}

/**
 * Error category detection for retry decisions
 */
export type ErrorCategory = 
  | 'rate_limit'
  | 'quota'
  | 'overload'
  | 'timeout'
  | 'network'
  | 'auth'
  | 'api'
  | 'server_error'
  | 'unknown';

const ERROR_CATEGORY_PATTERNS: Record<ErrorCategory, RegExp[]> = {
  rate_limit: [
    /rate.?limit/i,
    /too_many_requests/i,
    /429/i,
    /rate.?limit.?exceeded/i,
  ],
  quota: [
    /quota/i,
    /exceeded/i,
    /limit.?reached/i,
    /monthly.?limit/i,
    /daily.?limit/i,
  ],
  overload: [
    /overload/i,
    /overloaded/i,
    /server.?busy/i,
    /service.?unavailable/i,
    /503/i,
  ],
  timeout: [
    /timeout/i,
    /timed.?out/i,
    /request.?timeout/i,
    /etimedout/i,
  ],
  network: [
    /network/i,
    /connection/i,
    /econnrefused/i,
    /econnreset/i,
    /enotfound/i,
    /socket/i,
  ],
  auth: [
    /auth/i,
    /unauthorized/i,
    /invalid.?token/i,
    /401/i,
    /403/i,
    /credential/i,
  ],
  api: [
    /api.?error/i,
    /api.?fail/i,
    /bad.?request/i,
    /400/i,
  ],
  server_error: [
    /internal.?error/i,
    /500/i,
    /502/i,
    /503/i,
    /504/i,
    /server.?error/i,
  ],
  unknown: [],
};

/**
 * Detect error category from error message
 */
export function categorizeError(errorMessage: string): ErrorCategory {
  for (const [category, patterns] of Object.entries(ERROR_CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(errorMessage)) {
        return category as ErrorCategory;
      }
    }
  }
  return 'unknown';
}

/**
 * Check if error category is retryable
 */
export function isRetryable(category: ErrorCategory): boolean {
  switch (category) {
    case 'rate_limit':
    case 'quota':
    case 'overload':
    case 'timeout':
    case 'network':
    case 'server_error':
      return true;
    case 'auth':
    case 'api':
    case 'unknown':
      return false;
  }
}

/**
 * Get suggested base delay for error category
 */
export function getSuggestedDelay(category: ErrorCategory): number {
  switch (category) {
    case 'rate_limit':
      return 5000;  // Start higher for rate limits
    case 'quota':
      return 10000; // Much higher for quota issues
    case 'overload':
      return 2000;
    case 'timeout':
      return 2000;
    case 'network':
      return 1000;
    case 'server_error':
      return 3000;
    default:
      return 1000;
  }
}

/**
 * Create a retry scheduler configured for an error
 */
export function createRetrySchedulerForError(errorMessage: string): RetryScheduler {
  const category = categorizeError(errorMessage);
  const suggestedDelay = getSuggestedDelay(category);
  
  return new RetryScheduler({
    baseDelayMs: suggestedDelay,
    maxAttempts: category === 'quota' ? 3 : 5,
    jitterFactor: 0.3, // Less jitter for rate limits
    backoffMultiplier: category === 'rate_limit' ? 1.5 : 2,
  });
}
