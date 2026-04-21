import React, { useMemo, useState } from 'react';
import {
  Terminal,
  Wrench,
  FileJson2,
  FileText,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolRevealOnMount } from '../../ToolRevealOnMount';
import { formatTimestampForDisplay } from '../timeFormat';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';

export type ToolStatus = 'running' | 'success' | 'error' | 'pending';

interface ToolPartProps {
  toolId: string;
  toolName: string;
  input?: string;
  output?: string;
  status?: ToolStatus;
  time?: { start?: number; end?: number };
  timestamp?: string;
  className?: string;
}

type ParsedToolText = {
  summary: string;
  display: string;
  isJson: boolean;
};

function parseStructuredText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => parseStructuredText(entry))
      .filter((entry): entry is string => Boolean(entry && entry.trim().length > 0));

    return parts.length > 0 ? parts.join('') : null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = ['text', 'content', 'message', 'output', 'stdout', 'result'];

  for (const key of preferredKeys) {
    const parsed = parseStructuredText(record[key]);
    if (parsed && parsed.trim().length > 0) {
      return parsed;
    }
  }

  return null;
}

function summarizeStructuredValue(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      'command',
      'path',
      'filePath',
      'file_path',
      'description',
      'title',
      'query',
      'text',
      'content',
      'message',
      'output',
      'stdout',
      'result',
    ];

    for (const key of preferredKeys) {
      const candidate = record[key];
      const parsed = summarizeStructuredValue(candidate);
      if (parsed) {
        return parsed;
      }
    }
  }

  const text = parseStructuredText(value);
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 64 ? `${normalized.slice(0, 61)}…` : normalized;
}

function parseToolPayload(raw: string): ParsedToolText {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { summary: '…', display: '…', isJson: false };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const extractedText = parseStructuredText(parsed);
    const summary = summarizeStructuredValue(parsed) ?? '…';

    if (extractedText && extractedText.trim().length > 0) {
      return {
        summary,
        display: extractedText.replace(/\s+$/u, ''),
        isJson: false,
      };
    }

    return {
      summary,
      display: JSON.stringify(parsed, null, 2),
      isJson: true,
    };
  } catch {
    const normalized = trimmed.replace(/\s+/gu, ' ').trim();
    return {
      summary: normalized.length > 64 ? `${normalized.slice(0, 61)}…` : normalized,
      display: raw,
      isJson: false,
    };
  }
}

function getToolIcon(toolName: string, status: ToolStatus) {
  if (status === 'success') return CheckCircle2;
  if (status === 'error') return XCircle;

  const normalized = toolName.toLowerCase();

  if (normalized === 'bash' || normalized === 'shell' || normalized === 'cmd' || normalized === 'terminal') {
    return Terminal;
  }
  if (normalized === 'edit' || normalized === 'write' || normalized === 'create' || normalized === 'apply_patch') {
    return FileText;
  }
  if (normalized.includes('json') || normalized.includes('read') || normalized.includes('write')) {
    return FileJson2;
  }

  return Wrench;
}

export const ToolPart: React.FC<ToolPartProps> = ({
  toolId,
  toolName,
  input,
  output,
  status = 'pending',
  timestamp,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const Icon = getToolIcon(toolName, status);
  const parsedInput = useMemo(() => {
    if (!input) return { summary: '…', display: '…', isJson: false };
    return parseToolPayload(input);
  }, [input]);
  const parsedOutput = useMemo(() => {
    if (!output) return null;
    return parseToolPayload(output);
  }, [output]);

  const hasContent = Boolean(input?.trim().length || output?.trim().length);
  if (!hasContent) {
    return null;
  }

  const isError = status === 'error';
  const isSuccess = status === 'success';
  const displayName = toolName;
  const summaryText = input?.trim().length ? parsedInput.summary : (parsedOutput?.summary ?? parsedInput.summary);

  return (
    <ToolRevealOnMount animate>
      <div
        className={cn('tool-block', isSuccess && 'success', isError && 'error', className)}
        data-tool-id={toolId}
      >
        <div
          className={cn('tool-header', isError && 'tool-header-error')}
          onClick={() => setIsExpanded((value) => !value)}
          role="button"
          aria-expanded={isExpanded}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsExpanded((value) => !value);
            }
          }}
        >
          <span className="tool-toggle-area" aria-hidden="true">
            {isExpanded ? <ChevronDown size={14} className="toggle-icon" /> : <ChevronRight size={14} className="toggle-icon" />}
          </span>
          <Icon size={14} className="tool-icon" />
          <span className={cn('tool-badge', isSuccess && 'tool-badge-success', isError && 'tool-badge-error')}>
            {displayName}
          </span>
          {!isExpanded && summaryText ? <span className="tool-summary-text">{summaryText}</span> : null}
          {timestamp ? <span className="tool-timestamp">{formatTimestampForDisplay(timestamp)}</span> : null}
        </div>

        {isExpanded ? (
          <div className="tool-content">
            {input?.trim().length ? (
              <div className="tool-section">
                <div className="tool-section-label">Input</div>
                {parsedInput.isJson ? (
                  <pre className={cn('tool-input', 'is-json')}>
                    {parsedInput.display}
                  </pre>
                ) : (
                  <div className="tool-input">
                    <SimpleMarkdownRenderer content={parsedInput.display} variant="tool" />
                  </div>
                )}
              </div>
            ) : null}

            {output?.trim().length ? (
              <div className="tool-section">
                <div className="tool-section-label">Output</div>
                {parsedOutput?.isJson ? (
                  <pre className={cn('tool-output', status === 'success' && 'success', status === 'error' && 'error', 'is-json')}>
                    {parsedOutput.display}
                  </pre>
                ) : (
                  <div className={cn('tool-output', status === 'success' && 'success', status === 'error' && 'error')}>
                    <SimpleMarkdownRenderer content={parsedOutput?.display || output} variant="tool" />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToolRevealOnMount>
  );
};

export default ToolPart;
