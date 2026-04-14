import { useState, useEffect } from 'react';

interface RetryBannerProps {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
  nextRetryTime: number;
  errorCategory?: string; // from server
}

// Server-side error categories mapped to display info
const ERROR_CATEGORY_MAP: Record<string, { label: string; icon: string }> = {
  rate_limit: { label: 'Rate Limited', icon: '⚠️' },
  quota: { label: 'Quota Exceeded', icon: '📊' },
  overload: { label: 'Server Overloaded', icon: '🔥' },
  timeout: { label: 'Request Timeout', icon: '⏱️' },
  network: { label: 'Network Error', icon: '📡' },
  auth: { label: 'Authentication Error', icon: '🔐' },
  api: { label: 'API Error', icon: '🔌' },
  unknown: { label: 'Error', icon: '❌' },
};

export function RetryBanner({ attempt, maxAttempts, delayMs, errorMessage, nextRetryTime, errorCategory }: RetryBannerProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = Math.max(0, nextRetryTime - Date.now());
      setSecondsLeft(Math.ceil(remaining / 1000));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 100);

    return () => clearInterval(interval);
  }, [nextRetryTime]);

  // Use server category if available, otherwise detect from message
  const getErrorInfo = (): { label: string; icon: string } => {
    // Prefer server-provided category
    if (errorCategory && ERROR_CATEGORY_MAP[errorCategory]) {
      return ERROR_CATEGORY_MAP[errorCategory];
    }
    
    // Fall back to client-side detection
    const lowerMsg = errorMessage.toLowerCase();
    if (lowerMsg.includes('rate limit') || lowerMsg.includes('too_many_requests') || lowerMsg.includes('429')) {
      return { label: 'Rate Limited', icon: '⚠️' };
    }
    if (lowerMsg.includes('quota') || lowerMsg.includes('exceeded') || lowerMsg.includes('limit')) {
      return { label: 'Quota Exceeded', icon: '📊' };
    }
    if (lowerMsg.includes('overload') || lowerMsg.includes('overloaded')) {
      return { label: 'Server Overloaded', icon: '🔥' };
    }
    if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
      return { label: 'Request Timeout', icon: '⏱️' };
    }
    if (lowerMsg.includes('connection') || lowerMsg.includes('network')) {
      return { label: 'Network Error', icon: '📡' };
    }
    if (lowerMsg.includes('api') && (lowerMsg.includes('error') || lowerMsg.includes('fail'))) {
      return { label: 'API Error', icon: '🔌' };
    }
    return { label: 'Error', icon: '❌' };
  };

  const errorInfo = getErrorInfo();

  return (
    <div className="retry-banner">
      <div className="retry-content">
        <span className="retry-icon">{errorInfo.icon}</span>
        <div className="retry-info">
          <span className="retry-category">{errorInfo.label}</span>
          <span className="retry-attempt">
            Retry attempt {attempt}/{maxAttempts}
          </span>
        </div>
        <div className="retry-countdown">
          <span className="countdown-number">{secondsLeft}</span>
          <span className="countdown-label">sec</span>
        </div>
      </div>
      <div className="retry-error">
        {errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage}
      </div>
      <style>{`
        .retry-banner {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid #e94560;
          border-radius: 8px;
          padding: 12px 16px;
          margin: 8px 16px;
          box-shadow: 0 4px 12px rgba(233, 69, 96, 0.3);
          animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .retry-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .retry-icon {
          font-size: 24px;
        }
        
        .retry-info {
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        
        .retry-category {
          font-weight: 600;
          color: #e94560;
          font-size: 14px;
        }
        
        .retry-attempt {
          color: #888;
          font-size: 12px;
        }
        
        .retry-countdown {
          display: flex;
          align-items: baseline;
          gap: 4px;
          background: rgba(233, 69, 96, 0.2);
          padding: 8px 12px;
          border-radius: 6px;
        }
        
        .countdown-number {
          font-size: 24px;
          font-weight: 700;
          color: #e94560;
          font-variant-numeric: tabular-nums;
        }
        
        .countdown-label {
          font-size: 12px;
          color: #888;
        }
        
        .retry-error {
          margin-top: 8px;
          font-size: 12px;
          color: #666;
          font-family: monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
