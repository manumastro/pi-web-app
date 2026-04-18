import React from 'react';
import { ErrorBoundary } from '@/components/ui';

interface ChatErrorBoundaryProps {
  sessionId?: string;
  children: React.ReactNode;
}

export function ChatErrorBoundary({ sessionId, children }: ChatErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[200px] p-4 text-center">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 max-w-md">
            <h3 className="font-semibold text-destructive mb-2">Errore nella chat</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Si è verificato un errore durante il caricamento della conversazione.
            </p>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export default ChatErrorBoundary;
