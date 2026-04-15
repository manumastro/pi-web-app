// ── CodeBlock Component ──
// Syntax highlighting with copy button
// Inspired by OpenCode's CodeBlock

import { useState, useCallback } from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  title?: string;
}

export function CodeBlock({ 
  code, 
  language = 'plaintext', 
  showLineNumbers = false,
  maxHeight = '400px',
  title
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [code]);

  const lines = code.split('\n');

  return (
    <div className="code-block">
      {title && (
        <div className="code-block-title">
          <span className="code-block-lang">{language}</span>
          <span className="code-block-title-text">{title}</span>
        </div>
      )}
      
      <div className="code-block-header">
        <button 
          className={`code-copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      
      <div className="code-block-content" style={{ maxHeight }}>
        <pre className="code-pre">
          <code className={`language-${language}`}>
            {lines.map((line, i) => (
              <span key={i} className="code-line">
                {showLineNumbers && (
                  <span className="code-line-number">{i + 1}</span>
                )}
                <span className="code-line-content">{line || ' '}</span>
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      </div>

      <style>{`
        .code-block {
          background: #1e1e2e;
          border-radius: 8px;
          overflow: hidden;
          margin: 8px 0;
          border: 1px solid #333;
        }
        
        .code-block-title {
          background: #2a2a3e;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #333;
        }
        
        .code-block-lang {
          background: #e94560;
          color: white;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          font-weight: 600;
        }
        
        .code-block-title-text {
          color: #aaa;
          font-size: 12px;
          font-family: monospace;
        }
        
        .code-block-header {
          display: flex;
          justify-content: flex-end;
          padding: 4px 8px;
          background: #1e1e2e;
        }
        
        .code-copy-btn {
          background: transparent;
          border: 1px solid #444;
          color: #888;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .code-copy-btn:hover {
          background: #333;
          color: #fff;
          border-color: #555;
        }
        
        .code-copy-btn.copied {
          color: #4ade80;
          border-color: #4ade80;
        }
        
        .code-block-content {
          overflow: auto;
          padding: 12px;
        }
        
        .code-pre {
          margin: 0;
          font-family: 'Fira Code', 'Consolas', monospace;
          font-size: 13px;
          line-height: 1.5;
        }
        
        .code-line {
          display: flex;
        }
        
        .code-line-number {
          color: #555;
          min-width: 32px;
          text-align: right;
          padding-right: 16px;
          user-select: none;
        }
        
        .code-line-content {
          color: #cdd6f4;
          white-space: pre;
        }
      `}</style>
    </div>
  );
}

// ── StatusBadge Component ──
interface StatusBadgeProps {
  status: 'idle' | 'working' | 'streaming' | 'error' | 'reconnecting';
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG = {
  idle: { label: 'Idle', color: '#888', bg: 'rgba(136, 136, 136, 0.2)' },
  working: { label: 'Working', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.2)' },
  streaming: { label: 'Streaming', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.2)' },
  error: { label: 'Error', color: '#f87171', bg: 'rgba(248, 113, 113, 0.2)' },
  reconnecting: { label: 'Reconnecting', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)' },
};

export function StatusBadge({ status, showLabel = true, size = 'sm' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  
  return (
    <div 
      className="status-badge"
      style={{ 
        background: config.bg,
        color: config.color,
        fontSize: size === 'sm' ? '11px' : '12px',
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
      }}
    >
      <span 
        className={`status-dot ${status === 'working' || status === 'streaming' ? 'pulse' : ''}`}
        style={{ background: config.color }}
      />
      {showLabel && <span>{config.label}</span>}
      
      <style>{`
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 12px;
          font-weight: 500;
        }
        
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        
        .status-dot.pulse {
          animation: statusPulse 1.5s ease-in-out infinite;
        }
        
        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

// ── DiffView Component ──
interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffViewProps {
  oldContent?: string;
  newContent: string;
  title?: string;
  filePath?: string;
}

export function DiffView({ oldContent, newContent, title, filePath }: DiffViewProps) {
  const lines: DiffLine[] = [];
  
  if (oldContent) {
    // Simple line-by-line diff
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    let oldIdx = 0;
    let newIdx = 0;
    let lineNum = 1;
    
    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      if (oldIdx >= oldLines.length) {
        // Remaining lines are additions
        lines.push({
          type: 'added',
          content: newLines[newIdx],
          newLineNumber: lineNum++,
        });
        newIdx++;
      } else if (newIdx >= newLines.length) {
        // Remaining lines are deletions
        lines.push({
          type: 'removed',
          content: oldLines[oldIdx],
          oldLineNumber: oldIdx + 1,
        });
        oldIdx++;
      } else if (oldLines[oldIdx] === newLines[newIdx]) {
        // Unchanged
        lines.push({
          type: 'unchanged',
          content: oldLines[oldIdx],
          oldLineNumber: oldIdx + 1,
          newLineNumber: lineNum++,
        });
        oldIdx++;
        newIdx++;
      } else {
        // Changed - show as remove + add
        lines.push({
          type: 'removed',
          content: oldLines[oldIdx],
          oldLineNumber: oldIdx + 1,
        });
        lines.push({
          type: 'added',
          content: newLines[newIdx],
          newLineNumber: lineNum++,
        });
        oldIdx++;
        newIdx++;
      }
    }
  } else {
    // Just show additions
    newContent.split('\n').forEach((line, i) => {
      lines.push({
        type: 'added',
        content: line,
        newLineNumber: i + 1,
      });
    });
  }

  return (
    <div className="diff-view">
      {(title || filePath) && (
        <div className="diff-header">
          {filePath && <span className="diff-filepath">{filePath}</span>}
          {title && <span className="diff-title">{title}</span>}
        </div>
      )}
      
      <div className="diff-content">
        {lines.map((line, i) => (
          <div key={i} className={`diff-line diff-${line.type}`}>
            <span className="diff-line-num">
              {line.oldLineNumber || ''}
            </span>
            <span className="diff-line-num">
              {line.newLineNumber || ''}
            </span>
            <span className="diff-line-marker">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="diff-line-content">{line.content || ' '}</span>
          </div>
        ))}
      </div>

      <style>{`
        .diff-view {
          background: #1e1e2e;
          border-radius: 8px;
          overflow: hidden;
          margin: 8px 0;
          border: 1px solid #333;
          font-family: 'Fira Code', monospace;
          font-size: 13px;
        }
        
        .diff-header {
          background: #2a2a3e;
          padding: 8px 12px;
          border-bottom: 1px solid #333;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .diff-filepath {
          color: #cdd6f4;
          font-size: 12px;
        }
        
        .diff-title {
          color: #888;
          font-size: 11px;
        }
        
        .diff-content {
          overflow: auto;
          max-height: 400px;
        }
        
        .diff-line {
          display: flex;
          min-height: 20px;
        }
        
        .diff-line-num {
          color: #555;
          min-width: 40px;
          text-align: right;
          padding: 0 8px;
          user-select: none;
          background: rgba(255,255,255,0.02);
        }
        
        .diff-line-marker {
          width: 20px;
          text-align: center;
          font-weight: bold;
        }
        
        .diff-line-content {
          flex: 1;
          padding: 0 8px;
          white-space: pre;
        }
        
        .diff-added {
          background: rgba(74, 222, 128, 0.1);
        }
        
        .diff-added .diff-line-marker {
          color: #4ade80;
        }
        
        .diff-added .diff-line-content {
          color: #4ade80;
        }
        
        .diff-removed {
          background: rgba(248, 113, 113, 0.1);
        }
        
        .diff-removed .diff-line-marker {
          color: #f87171;
        }
        
        .diff-removed .diff-line-content {
          color: #f87171;
        }
        
        .diff-unchanged .diff-line-content {
          color: #888;
        }
      `}</style>
    </div>
  );
}

// ── ToolCall Component ──
interface ToolCallDisplayProps {
  name: string;
  args?: string;
  result?: string;
  isRunning?: boolean;
  isError?: boolean;
  onExpand?: () => void;
  expanded?: boolean;
}

export function ToolCallDisplay({
  name,
  args,
  result,
  isRunning = false,
  isError = false,
  onExpand,
  expanded = false,
}: ToolCallDisplayProps) {
  const isExpandable = args && args.length > 80;

  return (
    <div className={`tool-call ${isRunning ? 'running' : ''} ${isError ? 'error' : ''}`}>
      <div className="tool-call-header">
        <span className="tool-call-icon">{isRunning ? '⚙️' : isError ? '❌' : '🔧'}</span>
        <span className="tool-call-name">{name}</span>
        {isRunning && <span className="tool-running-indicator">running...</span>}
      </div>
      
      {args && (
        <div className="tool-call-args">
          {isExpandable && !expanded ? (
            <div className="tool-args-collapsed" onClick={onExpand}>
              {args.slice(0, 80)}… <span className="expand-hint">[click to expand]</span>
            </div>
          ) : (
            <pre className="tool-args-pre">{args}</pre>
          )}
        </div>
      )}
      
      {result && (
        <div className={`tool-call-result ${isError ? 'error' : 'success'}`}>
          <span className="result-marker">{isError ? '✕' : '✓'}</span>
          <pre className="tool-result-pre">{result}</pre>
        </div>
      )}

      <style>{`
        .tool-call {
          background: rgba(96, 165, 250, 0.1);
          border: 1px solid rgba(96, 165, 250, 0.3);
          border-radius: 8px;
          margin: 8px 0;
          overflow: hidden;
        }
        
        .tool-call.running {
          border-color: #ffa500;
          animation: toolPulse 2s infinite;
        }
        
        @keyframes toolPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 165, 0, 0.4); }
          50% { box-shadow: 0 0 8px 2px rgba(255, 165, 0, 0.2); }
        }
        
        .tool-call.error {
          border-color: #f87171;
          background: rgba(248, 113, 113, 0.1);
        }
        
        .tool-call-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.2);
        }
        
        .tool-call-icon {
          font-size: 14px;
        }
        
        .tool-call-name {
          font-family: monospace;
          font-size: 13px;
          color: #60a5fa;
          font-weight: 600;
        }
        
        .tool-running-indicator {
          font-size: 11px;
          color: #ffa500;
          margin-left: auto;
          animation: blink 1s infinite;
        }
        
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .tool-call-args {
          padding: 8px 12px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        
        .tool-args-collapsed {
          color: #888;
          font-family: monospace;
          font-size: 12px;
          cursor: pointer;
        }
        
        .tool-args-collapsed:hover {
          color: #aaa;
        }
        
        .expand-hint {
          color: #60a5fa;
          font-size: 11px;
        }
        
        .tool-args-pre {
          margin: 0;
          font-family: monospace;
          font-size: 12px;
          color: #cdd6f4;
          white-space: pre-wrap;
          word-break: break-all;
        }
        
        .tool-call-result {
          display: flex;
          gap: 8px;
          padding: 8px 12px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        
        .tool-call-result.success {
          background: rgba(74, 222, 128, 0.05);
        }
        
        .tool-call-result.error {
          background: rgba(248, 113, 113, 0.05);
        }
        
        .result-marker {
          color: #4ade80;
          font-weight: bold;
        }
        
        .tool-call-result.error .result-marker {
          color: #f87171;
        }
        
        .tool-result-pre {
          margin: 0;
          font-family: monospace;
          font-size: 12px;
          color: #888;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 200px;
          overflow: auto;
        }
      `}</style>
    </div>
  );
}

// ── FileTree Component (Enhanced) ──
interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: TreeNode[];
  modified?: boolean;
}

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
  selectedPath?: string;
}

function FileTreeNode({ node, depth, onSelect, selectedPath }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const isSelected = selectedPath === node.path;

  return (
    <div className="tree-node">
      <div 
        className={`tree-item ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.type === 'directory') {
            setExpanded(!expanded);
          }
          onSelect(node.path);
        }}
      >
        {node.type === 'directory' ? (
          <span className="tree-expand">{expanded ? '📂' : '📁'}</span>
        ) : (
          <span className="tree-file-icon">📄</span>
        )}
        <span className="tree-name">{node.name}</span>
        {node.modified && <span className="tree-modified">●</span>}
      </div>
      
      {node.type === 'directory' && expanded && node.children && (
        <div className="tree-children">
          {node.children.map((child, i) => (
            <FileTreeNode 
              key={i} 
              node={child} 
              depth={depth + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface EnhancedFileTreeProps {
  rootNodes: TreeNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
}

export function EnhancedFileTree({ rootNodes, selectedPath, onSelect }: EnhancedFileTreeProps) {
  return (
    <div className="enhanced-file-tree">
      {rootNodes.map((node, i) => (
        <FileTreeNode 
          key={i} 
          node={node} 
          depth={0}
          onSelect={onSelect}
          selectedPath={selectedPath}
        />
      ))}
      
      <style>{`
        .enhanced-file-tree {
          font-size: 13px;
          color: var(--color-text);
        }
        
        .tree-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.1s;
        }
        
        .tree-item:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        
        .tree-item.selected {
          background: rgba(96, 165, 250, 0.2);
        }
        
        .tree-expand, .tree-file-icon {
          font-size: 14px;
        }
        
        .tree-name {
          flex: 1;
          font-family: monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .tree-modified {
          color: #ffa500;
          font-size: 8px;
        }
      `}</style>
    </div>
  );
}
