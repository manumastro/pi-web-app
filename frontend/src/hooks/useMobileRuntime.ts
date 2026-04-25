import { useEffect } from 'react';
import { getMobileRuntimeState, getMobileViewportState } from '@/lib/mobileRuntime';

function updateMobileRuntimeClasses(root: HTMLElement): void {
  const coarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;

  const runtimeState = getMobileRuntimeState({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer,
  });

  root.classList.toggle('mobile-pointer', runtimeState.isMobileRuntime);
  root.classList.toggle('device-mobile', runtimeState.isCompactLayout);
  root.classList.toggle('desktop-runtime', !runtimeState.isMobileRuntime);

  const viewportState = getMobileViewportState(window, window.visualViewport ?? undefined);
  root.style.setProperty('--app-vh', `${viewportState.viewportHeight}px`);
  root.style.setProperty('--app-vw', `${viewportState.viewportWidth}px`);
  root.style.setProperty('--oc-visual-viewport-offset-top', `${viewportState.offsetTop}px`);
  root.style.setProperty('--oc-visual-viewport-offset-left', `${viewportState.offsetLeft}px`);
  root.style.setProperty('--oc-keyboard-inset', `${viewportState.keyboardInset}px`);
  root.style.setProperty('--oc-keyboard-avoid-offset', `${viewportState.keyboardInset}px`);
  root.style.setProperty('--oc-keyboard-home-indicator', viewportState.keyboardInset > 0 ? '34px' : '0px');
}

export function useMobileRuntime(): void {
  useEffect(() => {
    const root = document.documentElement;
    if (!root) {
      return;
    }

    const apply = () => updateMobileRuntimeClasses(root);
    apply();

    const coarsePointerQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null;

    window.addEventListener('resize', apply, { passive: true });
    window.addEventListener('orientationchange', apply, { passive: true });
    window.visualViewport?.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('scroll', apply);

    if (coarsePointerQuery) {
      if (typeof coarsePointerQuery.addEventListener === 'function') {
        coarsePointerQuery.addEventListener('change', apply);
      } else {
        coarsePointerQuery.addListener(apply);
      }
    }

    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      window.visualViewport?.removeEventListener('resize', apply);
      window.visualViewport?.removeEventListener('scroll', apply);

      if (coarsePointerQuery) {
        if (typeof coarsePointerQuery.removeEventListener === 'function') {
          coarsePointerQuery.removeEventListener('change', apply);
        } else {
          coarsePointerQuery.removeListener(apply);
        }
      }
    };
  }, []);
}

export default useMobileRuntime;
