import { describe, expect, it } from 'vitest';
import { getMobileRuntimeState, getMobileViewportState } from '@/lib/mobileRuntime';

describe('mobileRuntime', () => {
  it('treats compact layouts as mobile runtime', () => {
    expect(getMobileRuntimeState({ innerWidth: 768, innerHeight: 1024, maxTouchPoints: 0, coarsePointer: false })).toEqual({
      isCompactLayout: true,
      hasTouch: false,
      isMobileRuntime: true,
    });
  });

  it('treats coarse touch desktop widths as mobile runtime for touch-specific fixes', () => {
    expect(getMobileRuntimeState({ innerWidth: 1440, innerHeight: 900, maxTouchPoints: 5, coarsePointer: true })).toEqual({
      isCompactLayout: false,
      hasTouch: true,
      isMobileRuntime: true,
    });
  });

  it('computes viewport and keyboard metrics from visual viewport data', () => {
    expect(getMobileViewportState(
      { innerWidth: 390, innerHeight: 844 },
      { width: 390, height: 544, offsetTop: 24, offsetLeft: 0 },
    )).toEqual({
      viewportHeight: 544,
      viewportWidth: 390,
      offsetTop: 24,
      offsetLeft: 0,
      keyboardInset: 276,
    });
  });

  it('falls back to layout viewport values when visual viewport is unavailable', () => {
    expect(getMobileViewportState({ innerWidth: 1280, innerHeight: 720 })).toEqual({
      viewportHeight: 720,
      viewportWidth: 1280,
      offsetTop: 0,
      offsetLeft: 0,
      keyboardInset: 0,
    });
  });
});
