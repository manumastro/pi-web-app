import React from 'react';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';

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

  return (
    <TooltipProvider>
      <div className={cn('app-shell', !sidebarOpen && 'sidebar-collapsed', isCompactLayout && 'compact-layout')}>
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="sidebar">
            {sidebar}
          </aside>
        )}

        {showBackdrop ? (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close sidebar"
            onClick={onSidebarClose}
          />
        ) : null}

        {/* Main Content */}
        <main className="content">
          {connectionBanner}
          {header}
          {content}
        </main>
      </div>
    </TooltipProvider>
  );
}

export default MainLayout;
