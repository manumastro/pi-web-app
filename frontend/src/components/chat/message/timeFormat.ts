export function formatTimestampForDisplay(timestamp: string): string {
  if (timestamp === 'streaming') {
    return 'streaming';
  }

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(start: number, end?: number, now: number = Date.now()): string {
  const duration = end ? end - start : now - start;
  const seconds = duration / 1000;
  const displaySeconds = seconds < 0.05 && end !== undefined ? 0.1 : seconds;
  return `${displaySeconds.toFixed(1)}s`;
}
