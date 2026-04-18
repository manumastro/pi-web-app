import React from 'react';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui';

interface MainLayoutProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  content: React.ReactNode;
  connectionBanner?: React.ReactNode;
  sidebarOpen?: boolean;
}

export function MainLayout({ sidebar, header, content, connectionBanner, sidebarOpen = true }: MainLayoutProps) {
  return (
    <TooltipProvider>
      <div className={cn('app-shell', !sidebarOpen && 'sidebar-collapsed')}>
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="sidebar">
            {sidebar}
          </aside>
        )}

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
