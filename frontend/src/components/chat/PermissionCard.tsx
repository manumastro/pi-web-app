import type { PermissionItem } from '@/chatState';

interface PermissionCardProps {
  permission: PermissionItem;
  onApprove: () => Promise<void>;
  onDeny: () => Promise<void>;
}

function TerminalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5.5l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ToolIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M10 4l-3 3M7 7l-3 3M3.5 10L1 13l1.5-1.5M10 1l3 3-1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getToolDisplayName(action: string): string {
  const tool = action.toLowerCase();
  if (tool.includes('bash') || tool.includes('shell') || tool.includes('cmd')) return 'bash';
  if (tool.includes('edit') || tool.includes('write') || tool.includes('create')) return tool;
  return action;
}

export function PermissionCard({ permission, onApprove, onDeny }: PermissionCardProps) {
  const displayTool = getToolDisplayName(permission.action);

  return (
    <div className="permission-card">
      <div className="permission-header">
        <div className="permission-icon">
          {displayTool === 'bash' ? <TerminalIcon /> : <ToolIcon />}
        </div>
        <span className="permission-title">
          Permission request: {displayTool}
        </span>
      </div>

      <div className="permission-content">
        <div className="typography-meta text-muted-foreground mb-2">
          <span className="font-semibold">Action:</span>{' '}
          <code className="px-1 py-0.5 bg-muted/30 rounded text-xs">{permission.action}</code>
        </div>

        <div className="typography-meta text-muted-foreground mb-2">
          <span className="font-semibold">Resource:</span>{' '}
          <code className="px-1 py-0.5 bg-muted/30 rounded text-xs">{permission.resource}</code>
        </div>
      </div>

      <div className="permission-actions">
        <button
          type="button"
          className="btn btn-approve btn-sm"
          onClick={() => void onApprove()}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-deny btn-sm"
          onClick={() => void onDeny()}
        >
          Deny
        </button>
      </div>
    </div>
  );
}

export default PermissionCard;
