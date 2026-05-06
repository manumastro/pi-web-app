import { ChatView } from './components/views/ChatView';
import { SyncProvider } from './sync/sync-context';
import { opencodeClient } from './lib/opencode/client';

export default function App() {
  return (
    <SyncProvider sdk={opencodeClient.getSdkClient()} directory="/home/manu">
      <ChatView />
    </SyncProvider>
  );
}
