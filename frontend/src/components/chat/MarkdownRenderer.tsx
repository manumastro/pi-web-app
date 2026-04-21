import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useVirtualizer } from '@tanstack/react-virtual';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface SimpleMarkdownRendererProps {
  content: string;
  className?: string;
  components?: Record<string, React.ComponentType<any>>;
  variant?: 'assistant' | 'reasoning' | 'tool';
}

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);

const LARGE_CODE_BLOCK_LINE_THRESHOLD = 200;
const CODE_ROW_HEIGHT = 22;
let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null;

export function normalizeMarkdownContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.resolve();
}

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const ToolbarButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, onClick, children }) => (
  <button
    type="button"
    className="markdown-toolbar-button"
    onClick={onClick}
    aria-label={label}
    title={label}
  >
    {children}
  </button>
);

const MermaidBlock: React.FC<{ chart: string }> = ({ chart }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    const renderChart = async () => {
      try {
        const mermaidModule = mermaidModulePromise ?? import('mermaid');
        mermaidModulePromise = mermaidModule;
        const mermaid = (await mermaidModule).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'base' });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(id, chart);
        if (!mounted) return;
        setSvg(result.svg);
        setError(null);
      } catch (cause) {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to render Mermaid diagram');
      }
    };

    void renderChart();
    return () => {
      mounted = false;
    };
  }, [chart]);

  const handleCopy = async () => {
    await copyText(chart);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="markdown-mermaid-block">
      <div className="markdown-code-toolbar">
        <span className="markdown-code-language">mermaid</span>
        <div className="markdown-code-actions">
          <ToolbarButton label="Copy Mermaid" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </ToolbarButton>
          <ToolbarButton label="Download Mermaid" onClick={() => downloadTextFile('diagram.mmd', chart)}>
            <Download size={14} />
          </ToolbarButton>
        </div>
      </div>
      {error ? (
        <pre className="code-block markdown-mermaid-error">{chart}</pre>
      ) : (
        <div className="markdown-mermaid-output" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
};

const VirtualizedCodeLines: React.FC<{ lines: string[]; language: string; code: string }> = ({ lines, language, code }) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CODE_ROW_HEIGHT,
    overscan: 12,
  });
  const [copied, setCopied] = useState(false);

  const highlightedLines = useMemo(() => {
    if (!language || !hljs.getLanguage(language)) {
      return lines.map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }

    return lines.map((line) => hljs.highlight(line, { language }).value || '&nbsp;');
  }, [language, lines]);

  const handleCopy = async () => {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={cn('markdown-code-shell', theme === 'dark' ? 'is-dark' : 'is-light')}>
      <div className="markdown-code-toolbar">
        <span className="markdown-code-language">{language || 'text'}</span>
        <div className="markdown-code-actions">
          <ToolbarButton label="Copy code" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </ToolbarButton>
          <ToolbarButton label="Download code" onClick={() => downloadTextFile(`snippet.${language || 'txt'}`, code)}>
            <Download size={14} />
          </ToolbarButton>
        </div>
      </div>
      <div ref={parentRef} className="markdown-code-virtual-scroll">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              className="markdown-code-row"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
            >
              <span className="markdown-code-line-number">{item.index + 1}</span>
              <code dangerouslySetInnerHTML={{ __html: highlightedLines[item.index] || '&nbsp;' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CodeBlock: React.FC<{ children: string; className?: string }> = ({ children, className }) => {
  const language = className?.replace('language-', '') || '';
  const code = String(children).replace(/\n$/, '');
  const lines = useMemo(() => code.split('\n'), [code]);
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  if (language === 'mermaid') {
    return <MermaidBlock chart={code} />;
  }

  if (lines.length >= LARGE_CODE_BLOCK_LINE_THRESHOLD) {
    return <VirtualizedCodeLines lines={lines} language={language} code={code} />;
  }

  const highlightedCode = useMemo(() => {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
    return hljs.highlightAuto(code).value;
  }, [code, language]);

  const handleCopy = async () => {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={cn('markdown-code-shell', theme === 'dark' ? 'is-dark' : 'is-light')}>
      <div className="markdown-code-toolbar">
        <span className="markdown-code-language">{language || 'text'}</span>
        <div className="markdown-code-actions">
          <ToolbarButton label="Copy code" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </ToolbarButton>
          <ToolbarButton label="Download code" onClick={() => downloadTextFile(`snippet.${language || 'txt'}`, code)}>
            <Download size={14} />
          </ToolbarButton>
        </div>
      </div>
      <pre className="code-block"><code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: highlightedCode }} /></pre>
    </div>
  );
};

const InlineCode: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="inline-code">{children}</code>
);

const Link: React.FC<{ href?: string; children: React.ReactNode }> = ({ href = '', children }) => {
  const isExternal = href.startsWith('http://') || href.startsWith('https://');
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className={cn('link', isExternal && 'link-external')}
      data-external-link={isExternal ? 'true' : undefined}
    >
      <span>{children}</span>
      {isExternal ? <ExternalLink size={12} className="inline-block ml-1" /> : null}
    </a>
  );
};

const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ children, ...props }) => (
  <div className="markdown-table-wrap">
    <table className="markdown-table" {...props}>{children}</table>
  </div>
);

const TableHead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...props }) => (
  <thead className="markdown-thead" {...props}>{children}</thead>
);

const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...props }) => (
  <tbody className="markdown-tbody" {...props}>{children}</tbody>
);

const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ children, ...props }) => (
  <tr className="markdown-tr" {...props}>{children}</tr>
);

const TableHeaderCell: React.FC<React.ThHTMLAttributes<HTMLTableHeaderCellElement>> = ({ children, ...props }) => (
  <th className="markdown-th" {...props}>{children}</th>
);

const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ children, ...props }) => (
  <td className="markdown-td" {...props}>{children}</td>
);

export const SimpleMarkdownRenderer: React.FC<SimpleMarkdownRendererProps> = React.memo(function SimpleMarkdownRenderer({
  content,
  className,
  components,
  variant = 'assistant',
}) {
  const normalizedContent = useMemo(() => normalizeMarkdownContent(content), [content]);
  const mergedComponents = useMemo(() => ({
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      const isInline = !className?.startsWith('language-');
      if (isInline) {
        return <InlineCode>{children}</InlineCode>;
      }
      return <CodeBlock className={className}>{String(children)}</CodeBlock>;
    },
    a: Link as any,
    table: Table,
    thead: TableHead,
    tbody: TableBody,
    tr: TableRow,
    th: TableHeaderCell,
    td: TableCell,
    ...components,
  }), [components]);

  if (!normalizedContent) {
    return null;
  }

  return (
    <div className={cn('markdown-body', `markdown-${variant}`, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mergedComponents}>
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
});

export default SimpleMarkdownRenderer;
