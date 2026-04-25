export interface MobileRuntimeEnvironment {
  innerWidth: number;
  innerHeight: number;
  maxTouchPoints?: number;
  coarsePointer?: boolean;
}

export interface VisualViewportMetrics {
  width: number;
  height: number;
  offsetTop?: number;
  offsetLeft?: number;
}

export interface MobileRuntimeState {
  isCompactLayout: boolean;
  hasTouch: boolean;
  isMobileRuntime: boolean;
}

export interface MobileViewportState {
  viewportHeight: number;
  viewportWidth: number;
  offsetTop: number;
  offsetLeft: number;
  keyboardInset: number;
}

export function getMobileRuntimeState(environment: MobileRuntimeEnvironment): MobileRuntimeState {
  const isCompactLayout = environment.innerWidth <= 1024;
  const hasTouch = (environment.maxTouchPoints ?? 0) > 0 || Boolean(environment.coarsePointer);
  const isMobileRuntime = isCompactLayout || hasTouch;

  return {
    isCompactLayout,
    hasTouch,
    isMobileRuntime,
  };
}

export function getMobileViewportState(
  layoutViewport: Pick<MobileRuntimeEnvironment, 'innerWidth' | 'innerHeight'>,
  visualViewport?: VisualViewportMetrics | null,
): MobileViewportState {
  const viewportWidth = Math.round(visualViewport?.width ?? layoutViewport.innerWidth);
  const viewportHeight = Math.round(visualViewport?.height ?? layoutViewport.innerHeight);
  const offsetTop = Math.max(0, Math.round(visualViewport?.offsetTop ?? 0));
  const offsetLeft = Math.max(0, Math.round(visualViewport?.offsetLeft ?? 0));
  const keyboardInset = Math.max(0, Math.round(layoutViewport.innerHeight - viewportHeight - offsetTop));

  return {
    viewportHeight,
    viewportWidth,
    offsetTop,
    offsetLeft,
    keyboardInset,
  };
}
