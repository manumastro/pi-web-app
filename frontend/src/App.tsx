import { useEffect, useState, useRef } from 'react';
import { ChatView } from './components/views/ChatView';
import { SyncProvider } from './sync/sync-context';
import { useSync } from './sync/use-sync';
import { setOptimisticRefs } from './sync/session-actions';
import { opencodeClient } from './lib/opencode/client';
import { useConfigStore } from './stores/useConfigStore';

const DEFAULT_BOOTSTRAP_DIRECTORY = '/home/manu';

async function fetchBootstrapDirectory(): Promise<string> {
  try {
    const res = await fetch('/api/config/runtime');
    if (!res.ok) return DEFAULT_BOOTSTRAP_DIRECTORY;
    const cfg = await res.json();
    return cfg.directory || cfg.homeDirectory || cfg.homeDir || DEFAULT_BOOTSTRAP_DIRECTORY;
  } catch {
    return DEFAULT_BOOTSTRAP_DIRECTORY;
  }
}

function AppBootstrap() {
  useEffect(() => {
    void useConfigStore.getState().initializeApp();
  }, []);

  return null;
}

function SyncOptimisticBridge() {
  const sync = useSync();
  const addRef = useRef(sync.optimistic.add);
  const removeRef = useRef(sync.optimistic.remove);
  addRef.current = sync.optimistic.add;
  removeRef.current = sync.optimistic.remove;

  useEffect(() => {
    setOptimisticRefs(
      (input) => addRef.current(input),
      (input) => removeRef.current(input),
    );
  }, []);

  return null;
}

export default function App() {
  const [directory, setDirectory] = useState<string | null>(null);

  useEffect(() => {
    fetchBootstrapDirectory().then(setDirectory);
  }, []);

  // Async init guard — mount children once directory is resolved
  if (!directory) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-sm text-muted-foreground animate-pulse">Connecting...</div>
      </div>
    );
  }

  return (
    <SyncProvider sdk={opencodeClient.getSdkClient()} directory={directory}>
      <AppBootstrap />
      <SyncOptimisticBridge />
      <ChatView />
    </SyncProvider>
  );
}
