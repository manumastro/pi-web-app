import React from 'react';
import { OpenCodeLogo } from '../ui/OpenCodeLogo';

const ChatEmptyState: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full gap-6">
      <OpenCodeLogo width={140} height={24} className="opacity-20" />
      <span className="text-body-md text-muted">Inizia una nuova chat</span>
    </div>
  );
};

export default React.memo(ChatEmptyState);
