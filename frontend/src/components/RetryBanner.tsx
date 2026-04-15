import { useState, useEffect, useCallback } from 'react';
import { useSessionStatusStore, getErrorCategoryInfo, categorizeErrorMessage } from '../stores/sessionStatusStore';

interface RetryBannerProps {
  sessionId: string;
  /** Delay in milliseconds */
  delayMs?: number;
  onRetryNow?: () => void;
  onCancel?: () => void;
}

// Error category icons and labels
const ERROR_CATEGORY_MAP: Record<string, { label: string; icon: string }> = {
  rate_limit: { label: 'Rate Limited', icon: '⚠️' },
  quota: { label: 'Quota Exceeded', icon: '📊' },
  overload: { label: 'Server Overloaded', icon: '🔥' },
  timeout: { label: 'Request Timeout', icon: '⏱️' },
  network: { label: 'Network Error', icon: '📡' },
  auth: { label: 'Authentication Error', icon: '🔐' },
  api: { label: 'API Error', icon: '🔌' },
  unknown: { label: 'Connection Error', icon: '❌' },
};

function getErrorInfo(category: string | undefined, message: string): { label: string; icon: string } {
  if (category && ERROR_CATEGORY_MAP[category]) {
    return ERROR_CATEGORY_MAP[category];
  }
  
  // Fall back to client-side detection
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('rate limit') || lowerMsg.includes('too_many_requests') || lowerMsg.includes('429')) {
    return ERROR_CATEGORY_MAP.rate_limit;
  }
  if (lowerMsg.includes('quota') || lowerMsg.includes('exceeded')) {
    return ERROR_CATEGORY_MAP.quota;
  }
  if (lowerMsg.includes('overload') || lowerMsg.includes('overloaded')) {
    return ERROR_CATEGORY_MAP.overload;
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
    return ERROR_CATEGORY_MAP.timeout;
  }
  if (lowerMsg.includes('connection') || lowerMsg.includes('network')) {
    return ERROR_CATEGORY_MAP.network;
  }
  if (lowerMsg.includes('auth') || lowerMsg.includes('unauthorized')) {
    return ERROR_CATEGORY_MAP.auth;
  }
  if (lowerMsg.includes('api')) {
    return ERROR_CATEGORY_MAP.api;
  }
  return ERROR_CATEGORY_MAP.unknown;
}

export function RetryBanner({ sessionId, delayMs, onRetryNow, onCancel }: RetryBannerProps) {
  const retryState = useSessionStatusStore(s => s.retryState[sessionId]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [progress, setProgress] = useState(100);

  // Update countdown
  useEffect(() => {
    if (!retryState?.nextRetryTime) {
      setSecondsLeft(0);
      setProgress(100);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, retryState.nextRetryTime! - Date.now());
      setSecondsLeft(Math.ceil(remaining / 1000));
      
      // Calculate progress percentage
      if (delayMs && delayMs > 0) {
        setProgress((remaining / delayMs) * 100);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 100);

    return () => clearInterval(interval);
  }, [retryState?.nextRetryTime, delayMs]);

  if (!retryState) return null;

  const errorInfo = getErrorInfo(retryState.errorCategory, retryState.errorMessage);
  const isLastAttempt = retryState.attempt >= retryState.maxAttempts;

  const handleRetryNow = useCallback(() => {
    onRetryNow?.();
  }, [onRetryNow]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  return (
    <div className="retry-banner">
      <div className="retry-content">
        <span className="retry-icon">{errorInfo.icon}</span>
        <div className="retry-info">
          <span className="retry-category">{errorInfo.label}</span>
          <span className="retry-attempt">
            {isLastAttempt ? 'Final attempt' : `Retry ${retryState.attempt}/${retryState.maxAttempts}`}
          </span>
        </div>
        
        {/* Countdown display */}
        <div className="retry-countdown">
          {delayMs && delayMs > 0 ? (
            <div className="countdown-progress">
              <svg className="countdown-ring" viewBox="0 0 36 36">
                <circle
                  className="countdown-ring-bg"
                  cx="18" cy="18" r="16"
                  fill="none"
                  strokeWidth="2"
                />
                <circle
                  className="countdown-ring-progress"
                  cx="18" cy="18" r="16"
                  fill="none"
                  strokeWidth="2"
                  strokeDasharray={`${progress} 100`}
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <span className="countdown-number">{secondsLeft}</span>
            </div>
          ) : (
            <span className="countdown-number">{secondsLeft}</span>
          )}
          <span className="countdown-label">sec</span>
        </div>

        {/* Action buttons */}
        <div className="retry-actions">
          {!isLastAttempt && (
            <button className="retry-btn retry-now" onClick={handleRetryNow} title="Retry now">
              ▶️
            </button>
          )}
          <button className="retry-btn retry-cancel" onClick={handleCancel} title="Cancel">
            ✕
          </button>
        </div>
      </div>

      {/* Error message */}
      {retryState.errorMessage && (
        <div className="retry-error">
          <span className="retry-error-text">
            {retryState.errorMessage.length > 120 
              ? retryState.errorMessage.substring(0, 120) + '…' 
              : retryState.errorMessage}
          </span>
        </div>
      )}

      {/* Progress bar for total retry time */}
      {retryState.totalDelayMs > 0 && (
        <div className="retry-total-progress">
          <div 
            className="retry-total-bar" 
            style={{ width: `${Math.min((retryState.totalDelayMs / (delayMs || 1)) * 100, 100)}%` }}
          />
        </div>
      )}

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
          font-size: 12px;
          color: #888;
        }
        
        .retry-countdown {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .countdown-progress {
          position: relative;
          width: 40px;
          height: 40px;
        }
        
        .countdown-ring {
          width: 40px;
          height: 40px;
        }
        
        .countdown-ring-bg {
          stroke: #333;
        }
        
        .countdown-ring-progress {
          stroke: #e94560;
          stroke-linecap: round;
          transition: stroke-dasharray 0.1s ease;
        }
        
        .countdown-number {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 14px;
          font-weight: 700;
          color: #fff;
        }
        
        .countdown-label {
          font-size: 11px;
          color: #666;
        }
        
        .retry-actions {
          display: flex;
          gap: 8px;
        }
        
        .retry-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          padding: 6px 10px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }
        
        .retry-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.05);
        }
        
        .retry-now:hover {
          background: rgba(233, 69, 96, 0.3);
          border-color: #e94560;
        }
        
        .retry-error {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .retry-error-text {
          font-size: 12px;
          color: #aaa;
          font-family: monospace;
        }
        
        .retry-total-progress {
          margin-top: 8px;
          height: 3px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          overflow: hidden;
        }
        
        .retry-total-bar {
          height: 100%;
          background: linear-gradient(90deg, #e94560, #ff6b8a);
          transition: width 0.5s ease;
        }
      `}</style>
    </div>
  );
}

// ── Compact Retry Indicator (for header/sidebar) ──
export function RetryIndicator({ sessionId }: { sessionId: string }) {
  const retryState = useSessionStatusStore(s => s.retryState[sessionId]);

  if (!retryState) return null;

  const errorInfo = getErrorCategoryInfo(retryState.errorCategory);

  return (
    <div className="retry-indicator" title={`${errorInfo.label}: ${retryState.errorMessage}`}>
      <span className="retry-indicator-icon">{errorInfo.icon}</span>
      <span className="retry-indicator-text">
        {retryState.attempt}/{retryState.maxAttempts}
      </span>
      <style>{`
        .retry-indicator {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: rgba(233, 69, 96, 0.2);
          border: 1px solid #e94560;
          border-radius: 12px;
          padding: 2px 8px;
          font-size: 11px;
        }
        
        .retry-indicator-icon {
          font-size: 12px;
        }
        
        .retry-indicator-text {
          color: #e94560;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

// ── Reconnecting Banner ──
export function ReconnectingBanner({ 
  attempt, 
  maxAttempts,
  onRetryNow 
}: { 
  attempt: number; 
  maxAttempts: number;
  onRetryNow?: () => void;
}) {
  return (
    <div className="reconnecting-banner">
      <span className="reconnecting-icon">🔄</span>
      <span className="reconnecting-text">
        Reconnecting… ({attempt}/{maxAttempts})
      </span>
      {onRetryNow && (
        <button className="reconnect-now-btn" onClick={onRetryNow}>
          Retry now
        </button>
      )}
      <style>{`
        .reconnecting-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 165, 0, 0.2);
          border: 1px solid #ffa500;
          border-radius: 8px;
          padding: 8px 16px;
          margin: 8px 16px;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        .reconnecting-icon {
          font-size: 16px;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .reconnecting-text {
          color: #ffa500;
          font-size: 14px;
        }
        
        .reconnect-now-btn {
          margin-left: auto;
          background: rgba(255, 165, 0, 0.3);
          border: 1px solid #ffa500;
          border-radius: 4px;
          padding: 4px 12px;
          color: #ffa500;
          cursor: pointer;
          font-size: 12px;
        }
        
        .reconnect-now-btn:hover {
          background: rgba(255, 165, 0, 0.5);
        }
      `}</style>
    </div>
  );
}
