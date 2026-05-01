import React from 'react';
import type { ConversationItem, ThinkingItem, ToolCallItem, ToolResultItem } from '@/sync/conversation';
import type { PromptImageAttachment } from '@/types';
import { cn } from '@/lib/utils';
import { useSessionUiStore } from '@/stores/sessionUiStore';
import { ReasoningPart } from './parts/ReasoningPart';
import { ToolPart } from './parts/ToolPart';
import { AssistantTextPart } from './parts/AssistantTextPart';
import './MessageBody.css';

type MessageBodyProps = {
  item: ConversationItem;
  className?: string;
  showReasoningTraces?: boolean;
};

function buildUploadUrl(sessionId: string | undefined, uploadId: string): string {
  if (!sessionId) {
    return '';
  }
  return `/api/uploads/${encodeURIComponent(sessionId)}/${encodeURIComponent(uploadId)}`;
}

export const MessageBody: React.FC<MessageBodyProps> = React.memo(function MessageBody({ item, className, showReasoningTraces = true }) {
  const sessionId = useSessionUiStore((state) => state.selectedSessionId);
  switch (item.kind) {
    case 'message':
      return (
        <MessageContent
          content={item.content}
          attachments={item.attachments}
          status={item.status}
          role={item.role}
          sessionId={sessionId}
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
}, (prev, next) => prev.item === next.item && prev.className === next.className && prev.showReasoningTraces === next.showReasoningTraces);

// Message content rendering with markdown support
interface MessageContentProps {
  content: string;
  attachments?: PromptImageAttachment[];
  status?: 'streaming' | 'complete' | 'aborted' | 'error';
  role: 'user' | 'assistant' | 'system';
  sessionId?: string;
  className?: string;
}

const MessageContent: React.FC<MessageContentProps> = ({
  content,
  attachments,
  status,
  role,
  sessionId,
  className,
}) => {
  if (role === 'user') {
    const userAttachments = attachments ?? [];
    return (
      <div className={cn('message-text-content', className)}>
        {userAttachments.length > 0 ? (
          <div className="message-attachment-grid">
            {userAttachments.map((attachment) => {
              const src = buildUploadUrl(sessionId, attachment.uploadId);
              return (
                <a key={attachment.uploadId} className="message-attachment-card" href={src || undefined} target="_blank" rel="noreferrer">
                  {src ? (
                    <img className="message-attachment-thumb" src={src} alt={attachment.fileName} loading="lazy" />
                  ) : null}
                  <span className="message-attachment-name">{attachment.fileName}</span>
                </a>
              );
            })}
          </div>
        ) : null}
        {content.trim().length > 0 ? <div className="message-user-text">{content}</div> : userAttachments.length > 0 ? null : '—'}
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
