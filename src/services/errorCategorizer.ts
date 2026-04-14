// ── Error Categorization Service ──

import type { ErrorInfo } from '../types';

export function categorizeError(message: string): ErrorInfo {
  const lowerMsg = message.toLowerCase();

  // Rate limiting
  if (lowerMsg.includes('rate limit') || lowerMsg.includes('too_many_requests') || lowerMsg.includes('429')) {
    return { category: 'rate_limit', isRetryable: true };
  }

  // Quota exceeded
  if (lowerMsg.includes('quota') || lowerMsg.includes('exceeded') || lowerMsg.includes('limit')) {
    return { category: 'quota', isRetryable: true };
  }

  // Server overloaded
  if (lowerMsg.includes('overload') || lowerMsg.includes('overloaded')) {
    return { category: 'overload', isRetryable: true };
  }

  // Timeout
  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
    return { category: 'timeout', isRetryable: true };
  }

  // Network errors
  if (lowerMsg.includes('connection') || lowerMsg.includes('network') || lowerMsg.includes('econnrefused') || lowerMsg.includes('enetunreach')) {
    return { category: 'network', isRetryable: true };
  }

  // Auth errors - not retryable
  if (lowerMsg.includes('auth') || lowerMsg.includes('unauthorized') || lowerMsg.includes('401') || lowerMsg.includes('403')) {
    return { category: 'auth', isRetryable: false };
  }

  // API errors - not retryable
  if (lowerMsg.includes('api') || lowerMsg.includes('invalid') || lowerMsg.includes('bad request') || lowerMsg.includes('400')) {
    return { category: 'api', isRetryable: false };
  }

  // Generic retryable
  return { category: 'unknown', isRetryable: true };
}
