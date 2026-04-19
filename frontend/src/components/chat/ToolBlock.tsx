import { ChevronRight, Terminal, Wrench, FileJson2, FileText, CheckCircle2, XCircle } from 'lucide-react';
import ToolRevealOnMount from './ToolRevealOnMount';

interface ToolResultSummary {
  content: string;
  time: string;
  tone?: 'default' | 'success' | 'error';
}

interface ToolBlockProps {
  kind: 'tool_call' | 'tool_result';
  toolName: string;
  time: string;
  content: string;
  result?: ToolResultSummary;
  tone?: 'default' | 'success' | 'error';
}

type ParsedToolContent = {
  summary: string;
  display: string;
  isJson: boolean;
};

type ToolSectionOptions = {
  tone?: 'default' | 'success' | 'error';
  shellPrefix?: string;
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
    const preferredKeys = ['command', 'path', 'filePath', 'file_path', 'description', 'title', 'query', 'text', 'content', 'message', 'output', 'stdout', 'result'];
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

function parseToolPayload(raw: string): ParsedToolContent {
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

function toolIcon(kind: ToolBlockProps['kind'], toolName: string) {
  const tool = toolName.toLowerCase();
  if (kind === 'tool_result') {
    return tool === 'error' ? XCircle : CheckCircle2;
  }
  if (tool.includes('bash') || tool.includes('shell') || tool.includes('cmd') || tool.includes('terminal')) {
    return Terminal;
  }
  if (tool.includes('read') || tool.includes('write') || tool.includes('edit') || tool.includes('file')) {
    return FileText;
  }
  if (tool.includes('json') || tool.includes('result')) {
    return FileJson2;
  }
  return Wrench;
}

function renderToolSection(label: string, payload: string, options: ToolSectionOptions = {}) {
  const parsed = parseToolPayload(payload);
  const tone = options.tone ?? 'default';
  const prefix = options.shellPrefix;

  return (
    <section className={`message-tool-section ${tone}`}>
      <div className="message-tool-section-header">
        <span className="message-badge">{label}</span>
      </div>
      <div className={`message-tool-surface ${tone}`}>
        <pre className={`message-code-block message-tool-code ${parsed.isJson ? 'message-code-block-json' : ''}`}>
          {prefix ? <span className="message-tool-shell-prefix">{prefix} </span> : null}
          {parsed.display}
        </pre>
      </div>
    </section>
  );
}

export function ToolBlock({ kind, toolName, time, content, result, tone = 'default' }: ToolBlockProps) {
  const parsed = parseToolPayload(content);
  const Icon = toolIcon(kind, toolName);
  const summaryLabel = kind === 'tool_call' ? toolName.toLowerCase() : (tone === 'error' ? 'error' : 'result');
  const resultTone = result?.tone ?? 'default';
  const hasCombinedResult = kind === 'tool_call' && Boolean(result);
  const headerSummary = parsed.summary;
  const bashLike = toolName.toLowerCase().includes('bash') || toolName.toLowerCase().includes('shell') || toolName.toLowerCase().includes('cmd') || toolName.toLowerCase().includes('terminal');

  return (
    <ToolRevealOnMount animate>
      <details className={`message message-tool message-tool-${kind} ${tone}`} open>
        <summary className="message-tool-summary">
          <span className="message-tool-toggle" aria-hidden="true">
            <span className="message-tool-toggle-icon message-tool-toggle-icon-tool">
              <Icon size={14} />
            </span>
            <span className="message-tool-toggle-icon message-tool-toggle-icon-chevron">
              <ChevronRight size={14} />
            </span>
          </span>
          <span className="message-badge">{summaryLabel}</span>
          <span className="message-tool-summary-text">{headerSummary}</span>
          <span className="message-time">{time}</span>
        </summary>
        <div className="message-tool-body">
          {kind === 'tool_call' ? (
            <div className="message-tool-stack">
              {content.trim().length > 0 ? renderToolSection('Input', content, { shellPrefix: bashLike ? '$' : undefined }) : null}
              {hasCombinedResult ? renderToolSection(result?.tone === 'error' ? 'Error' : 'Output', result?.content ?? '', { tone: resultTone }) : null}
            </div>
          ) : (
            <div className="message-tool-stack">
              {renderToolSection(tone === 'error' ? 'Error' : 'Output', content, { tone })}
            </div>
          )}
        </div>
      </details>
    </ToolRevealOnMount>
  );
}

export default ToolBlock;
