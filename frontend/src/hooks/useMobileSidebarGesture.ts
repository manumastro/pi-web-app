import { useCallback, useEffect, useRef, useState } from 'react';

interface MobileSidebarGestureOptions {
  open: boolean;
  enabled: boolean;
  onOpenChange: (open: boolean) => void;
  edgeThreshold?: number;
  widthRatio?: number;
}

interface GestureHandlers {
  onTouchStart: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchEnd: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchCancel: () => void;
}

function getDrawerWidth(widthRatio: number): number {
  if (typeof window === 'undefined') {
    return 320;
  }

  return Math.min(window.innerWidth * widthRatio, window.innerWidth - 32);
}

export function useMobileSidebarGesture({
  open,
  enabled,
  onOpenChange,
  edgeThreshold = 24,
  widthRatio = 0.85,
}: MobileSidebarGestureOptions): { drawerX: number; isDragging: boolean; handlers: GestureHandlers } {
  const [drawerX, setDrawerX] = useState(() => (open ? 0 : -getDrawerWidth(widthRatio)));
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const startedRef = useRef(false);
  const horizontalIntentRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled || isDragging) {
      return;
    }

    setDrawerX(open ? 0 : -getDrawerWidth(widthRatio));
  }, [enabled, isDragging, open, widthRatio]);

  const reset = useCallback(() => {
    startedRef.current = false;
    horizontalIntentRef.current = null;
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (!enabled) {
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    const drawerWidth = getDrawerWidth(widthRatio);
    const shouldTrack = open ? touch.clientX <= drawerWidth + 24 : touch.clientX <= edgeThreshold;
    if (!shouldTrack) {
      reset();
      return;
    }

    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    startedRef.current = true;
    horizontalIntentRef.current = null;
    setIsDragging(false);
  }, [edgeThreshold, enabled, open, reset, widthRatio]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (!enabled || !startedRef.current) {
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;

    if (horizontalIntentRef.current === null && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
      horizontalIntentRef.current = Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
    }

    if (horizontalIntentRef.current !== true) {
      return;
    }

    const drawerWidth = getDrawerWidth(widthRatio);
    const nextX = open
      ? Math.min(0, Math.max(-drawerWidth, deltaX))
      : Math.min(0, Math.max(-drawerWidth, -drawerWidth + Math.max(0, deltaX)));

    setIsDragging(true);
    setDrawerX(nextX);
    event.preventDefault();
  }, [enabled, open, widthRatio]);

  const handleTouchEnd = useCallback((_event: React.TouchEvent<HTMLElement>) => {
    if (!enabled || !startedRef.current) {
      reset();
      return;
    }

    const drawerWidth = getDrawerWidth(widthRatio);
    const shouldOpen = drawerX > -drawerWidth * 0.55;
    onOpenChange(shouldOpen);
    setDrawerX(shouldOpen ? 0 : -drawerWidth);
    reset();
  }, [drawerX, enabled, onOpenChange, reset, widthRatio]);

  return {
    drawerX,
    isDragging,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: reset,
    },
  };
}

export default useMobileSidebarGesture;
