import { describe, expect, it } from 'vitest';
import {
  getSessionActivityPhase,
  getSessionActivityResult,
  getVisualStreamingState,
  isRunningSessionStatus,
} from './sessionActivity';

describe('sessionActivity', () => {
  it('treats busy-style statuses as running', () => {
    expect(isRunningSessionStatus('busy')).toBe(true);
    expect(isRunningSessionStatus('prompting')).toBe(true);
    expect(isRunningSessionStatus('waiting_permission')).toBe(true);
    expect(isRunningSessionStatus('idle')).toBe(false);
  });

  it('maps status strings to the expected activity phase', () => {
    expect(getSessionActivityPhase('retry')).toBe('retry');
    expect(getSessionActivityPhase('busy')).toBe('busy');
    expect(getSessionActivityPhase('answering')).toBe('busy');
    expect(getSessionActivityPhase('idle')).toBe('idle');
  });

  it('produces a working result for any running status', () => {
    expect(getSessionActivityResult('busy')).toEqual({
      phase: 'busy',
      isWorking: true,
      isBusy: true,
      isCooldown: false,
    });
    expect(getSessionActivityResult('idle')).toEqual({
      phase: 'idle',
      isWorking: false,
      isBusy: false,
      isCooldown: false,
    });
  });

  it('keeps the transport state when the session is not running', () => {
    expect(getVisualStreamingState('idle', 'connecting')).toBe('connecting');
    expect(getVisualStreamingState('busy', 'idle')).toBe('streaming');
  });
});
