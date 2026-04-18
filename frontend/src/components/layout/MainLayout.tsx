import React from 'react';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui';

interface MainLayoutProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  content: React.ReactNode;
  connectionBanner?: React.ReactNode;
}

export function MainLayout({ sidebar, header, content, connectionBanner }: MainLayoutProps) {
  return (
    <TooltipProvider>
      <div className="app-shell" style={{ gridTemplateColumns: 'var(--sidebar-width, 250px) minmax(0, 1fr)' }}>
        {/* Sidebar */}
        <aside className="sidebar">
          {sidebar}
        </aside>

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
