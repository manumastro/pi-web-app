import React from 'react';
import { cn } from '@/lib/utils';
import { formatTimestampForDisplay } from './timeFormat';

type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

interface MessageHeaderProps {
  role: MessageRole;
  timestamp?: string;
  agentName?: string;
  className?: string;
}

const roleLabels: Record<MessageRole, string> = {
  user: 'You',
  assistant: 'Assistant',
  system: 'System',
  tool: 'Tool',
};

const roleColors: Record<MessageRole, string> = {
  user: 'role-user',
  assistant: 'role-assistant',
  system: 'role-system',
  tool: 'role-tool',
};

export const MessageHeader: React.FC<MessageHeaderProps> = ({
  role,
  timestamp,
  agentName,
  className,
}) => {
  return (
    <div className={cn('message-header', className)}>
      <span className={cn('message-role-badge', roleColors[role])}>
        {agentName || roleLabels[role]}
      </span>
      {timestamp && (
        <span className="message-timestamp">
          {formatTimestampForDisplay(timestamp)}
        </span>
      )}
    </div>
  );
};

export default MessageHeader;
