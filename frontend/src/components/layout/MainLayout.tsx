import React from 'react';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useMobileSidebarGesture } from '@/hooks/useMobileSidebarGesture';

interface MainLayoutProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  content: React.ReactNode;
  connectionBanner?: React.ReactNode;
  sidebarOpen?: boolean;
  onSidebarClose?: () => void;
}

export function MainLayout({ sidebar, header, content, connectionBanner, sidebarOpen = true, onSidebarClose }: MainLayoutProps) {
  const isCompactLayout = useMediaQuery('(max-width: 1024px)');
  const showBackdrop = isCompactLayout && sidebarOpen && typeof onSidebarClose === 'function';
  const { drawerX, isDragging, handlers } = useMobileSidebarGesture({
    open: sidebarOpen,
    enabled: isCompactLayout && typeof onSidebarClose === 'function',
    onOpenChange: (nextOpen) => {
      if (nextOpen !== sidebarOpen) {
        onSidebarClose?.();
      }
    },
  });

  const mobileDrawerProgress = isCompactLayout ? 1 - Math.abs(drawerX) / Math.max(1, typeof window === 'undefined' ? 320 : Math.min(window.innerWidth * 0.85, window.innerWidth - 32)) : 0;

  return (
    <TooltipProvider>
      <div
        className={cn('app-shell', !sidebarOpen && 'sidebar-collapsed', isCompactLayout && 'compact-layout', isDragging && 'mobile-drawer-dragging')}
        {...(isCompactLayout ? handlers : {})}
      >
        {(sidebarOpen || isCompactLayout) && (
          <aside
            className={cn('sidebar drawer-safe-area', isCompactLayout && 'mobile-drawer', isCompactLayout && !sidebarOpen && !isDragging && 'sidebar-closed-mobile')}
            style={isCompactLayout ? { transform: `translate3d(${drawerX}px, 0, 0)` } : undefined}
            aria-hidden={isCompactLayout ? !sidebarOpen : undefined}
          >
            {sidebar}
          </aside>
        )}

        {showBackdrop ? (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close sidebar"
            onClick={onSidebarClose}
            style={{ opacity: mobileDrawerProgress }}
          />
        ) : null}

        <main className="content main-content-safe-area">
          {connectionBanner}
          {header}
          {content}
        </main>
      </div>
    </TooltipProvider>
  );
}

export default MainLayout;
