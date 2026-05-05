import React from 'react';
import { ChatView } from './components/ChatView';

const App: React.FC = () => {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <ChatView />
    </div>
  );
};

export default App;
