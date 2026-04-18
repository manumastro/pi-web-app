import React from 'react';

interface ChatEmptyStateProps {
  onNewSession?: () => void;
}

export function ChatEmptyState({ onNewSession }: ChatEmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-illustration" aria-hidden="true">
        <div className="empty-state-ring" />
        <div className="empty-state-core" />
      </div>
      <p className="empty-state-title">No sessions in this workspace yet.</p>
      <p className="empty-state-subtitle">Create a session to start chatting with the workspace.</p>
      {onNewSession && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onNewSession}>
          Add action
        </button>
      )}
    </div>
  );
}

export default ChatEmptyState;
