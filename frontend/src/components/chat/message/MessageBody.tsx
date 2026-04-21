import React from 'react';
import type { ConversationItem, ThinkingItem, ToolCallItem, ToolResultItem } from '@/sync/conversation';
import { cn } from '@/lib/utils';
import { ReasoningPart } from './parts/ReasoningPart';
import { ToolPart } from './parts/ToolPart';
import { AssistantTextPart } from './parts/AssistantTextPart';

type MessageBodyProps = {
  item: ConversationItem;
  className?: string;
  showReasoningTraces?: boolean;
};

export const MessageBody: React.FC<MessageBodyProps> = ({ item, className, showReasoningTraces = true }) => {
  switch (item.kind) {
    case 'message':
      return (
        <MessageContent
          content={item.content}
          status={item.status}
          role={item.role}
          className={className}
        />
      );
    case 'thinking':
      return showReasoningTraces ? <ThinkingBody item={item} className={className} /> : null;
    case 'tool_call':
      return <ToolCallBody item={item} className={className} />;
    case 'tool_result':
      return <ToolResultBody item={item} className={className} />;
    case 'error':
      return <ErrorBody item={item} className={className} />;
    default:
      return null;
  }
};

// Message content rendering with markdown support
interface MessageContentProps {
  content: string;
  status?: 'streaming' | 'complete' | 'aborted';
  role: 'user' | 'assistant' | 'system';
  className?: string;
}

const MessageContent: React.FC<MessageContentProps> = ({
  content,
  status,
  role,
  className,
}) => {
  if (role === 'user') {
    return (
      <div className={cn('message-text-content', className)}>
        {content || '—'}
      </div>
    );
  }

  if (!content || content.trim().length === 0) {
    return null;
  }

  return (
    <AssistantTextPart
      text={content}
      isStreaming={status === 'streaming'}
      className={className}
    />
  );
};

// Thinking/reasoning body
interface ThinkingBodyProps {
  item: ThinkingItem;
  className?: string;
}

const ThinkingBody: React.FC<ThinkingBodyProps> = ({ item, className }) => {
  return (
    <ReasoningPart
      text={item.content}
      variant="thinking"
      blockId={item.id}
      done={item.done}
      className={className}
    />
  );
};

// Tool call body
interface ToolCallBodyProps {
  item: ToolCallItem;
  className?: string;
}

const ToolCallBody: React.FC<ToolCallBodyProps> = ({ item, className }) => {
  return (
    <ToolPart
      toolId={item.toolCallId}
      toolName={item.toolName}
      input={item.input}
      status="running"
      className={className}
    />
  );
};

// Tool result body
interface ToolResultBodyProps {
  item: ToolResultItem;
  className?: string;
}

const ToolResultBody: React.FC<ToolResultBodyProps> = ({ item, className }) => {
  return (
    <ToolPart
      toolId={item.toolCallId}
      toolName="result"
      output={item.result}
      status={item.success ? 'success' : 'error'}
      className={className}
    />
  );
};

// Error body
interface ErrorBodyProps {
  item: Extract<ConversationItem, { kind: 'error' }>;
  className?: string;
}

const ErrorBody: React.FC<ErrorBodyProps> = ({ item, className }) => {
  return (
    <div className={cn('error-inline', className)}>
      <span className="error-category">[{item.category}]</span>
      <span className="error-message">{item.message}</span>
      {!item.recoverable && (
        <span className="error-badge">non-recoverable</span>
      )}
    </div>
  );
};

export default MessageBody;
