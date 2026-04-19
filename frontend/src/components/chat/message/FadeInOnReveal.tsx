import React, { useEffect, useRef, useState, useCallback } from 'react';

interface FadeInOnRevealProps {
  children: React.ReactNode;
  animate?: boolean;
  className?: string;
  duration?: number;
  delay?: number;
}

export function FadeInOnReveal({
  children,
  animate = true,
  className = '',
  duration = 200,
  delay = 0,
}: FadeInOnRevealProps) {
  const [isVisible, setIsVisible] = useState(!animate);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate) {
      setIsVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) {
      setIsVisible(true);
      return;
    }

    // Use requestAnimationFrame for smooth animation start
    let rafId: number;
    const timeoutId = setTimeout(() => {
      rafId = requestAnimationFrame(() => {
        setIsVisible(true);
      });
    }, delay > 0 ? delay : 0);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [animate, delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transition: isVisible ? 'none' : `opacity ${duration}ms ease-out ${delay}ms`,
      }}
      data-fade-in={animate}
      data-fade-in-visible={isVisible}
    >
      {children}
    </div>
  );
}

export const FadeInDisabledContext = React.createContext(false);

export function useFadeInDisabled(): boolean {
  return React.useContext(FadeInDisabledContext);
}

// Hook for wipe animation on mount
export function useWipeReveal(isEnabled: boolean = true) {
  const [revealed, setRevealed] = useState(!isEnabled);
  const [shouldRender, setShouldRender] = useState(!isEnabled);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!isEnabled) {
      setRevealed(true);
      setShouldRender(true);
      return;
    }

    // Small delay before starting animation
    timeoutRef.current = setTimeout(() => {
      setRevealed(true);
    }, 50);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isEnabled]);

  const onAnimationEnd = useCallback(() => {
    if (!isEnabled) {
      setShouldRender(false);
    }
  }, [isEnabled]);

  return {
    revealed,
    shouldRender,
    onAnimationEnd,
    wipeStyle: {
      transform: revealed ? 'scaleX(1)' : 'scaleX(0)',
      transformOrigin: 'left',
      transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
    } as React.CSSProperties,
  };
}

export default FadeInOnReveal;
