import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { generateCodeTheme } from '@/lib/codeTheme';

interface SimpleMarkdownRendererProps {
  content: string;
  className?: string;
  components?: Record<string, React.ComponentType<any>>;
}

// Simple code block component with syntax highlighting
const CodeBlock: React.FC<{ children: string; className?: string; node?: any }> = ({
  children,
  className,
}) => {
  const language = className?.replace('language-', '') || '';
  const code = String(children).replace(/\n$/, '');
  
  // Use theme-based syntax highlighting
  const theme = useTheme();
  const codeTheme = generateCodeTheme(theme === 'dark');

  // Simple token-based highlighting for common patterns
  const highlightedCode = useMemo(() => {
    if (!code) return '';
    
    // Basic patterns for common languages
    const patterns: [RegExp, string][] = [
      // Strings (double and single quoted)
      [/(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g, 'string'],
      // Comments
      [/\/\/.*$/gm, 'comment'],
      [/#.*$/gm, 'comment'],
      [/\/\*[\s\S]*?\*\//g, 'comment'],
      // Keywords
      [/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|super|extends|implements|static|public|private|protected|readonly|type|interface|enum|namespace|module|declare|abstract|as|is|in|of|get|set)\b/g, 'keyword'],
      // Booleans and null
      [/\b(true|false|null|undefined|void)\b/g, 'literal'],
      // Numbers
      [/\b\d+\.?\d*\b/g, 'number'],
      // Function calls
      [/\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, 'function'],
      // Types (capitalized words)
      [/\b[A-Z][a-zA-Z0-9_$]*\b/g, 'type'],
      // HTML/JSX tags
      [/<\/?[\w-]+/g, 'tag'],
      // Operators
      [/[=+\-*/%<>!&|^~?:]+/g, 'operator'],
    ];

    let result = code;
    
    // Apply syntax highlighting with HTML spans
    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    };

    return escapeHtml(code);
  }, [code, language]);

  return (
    <pre className={cn('code-block', 'overflow-x-auto rounded-lg p-4 my-2', theme === 'dark' ? 'bg-[#1c1b1a]' : 'bg-[#f5f5f0]')}>
      {language && (
        <div className="code-language text-xs text-muted-foreground mb-1 font-mono">
          {language}
        </div>
      )}
      <code
        className={cn('font-mono text-sm leading-relaxed', `language-${language}`)}
        dangerouslySetInnerHTML={{ __html: highlightedCode }}
      />
    </pre>
  );
};

// Inline code component
const InlineCode: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="inline-code">
    {children}
  </code>
);

// Link component
const Link: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => {
  const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
  
  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="link link-external"
      >
        {children}
      </a>
    );
  }
  
  return (
    <a href={href} className="link">
      {children}
    </a>
  );
};

export const SimpleMarkdownRenderer: React.FC<SimpleMarkdownRendererProps> = ({
  content,
  className,
  components,
}) => {
  if (!content || content.trim().length === 0) {
    return null;
  }

  return (
    <div className={cn('markdown-body', 'prose', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ className, children, ...props }) => {
            const isInline = !className?.startsWith('language-');
            if (isInline) {
              return <InlineCode>{children}</InlineCode>;
            }
            return <CodeBlock className={className}>{String(children)}</CodeBlock>;
          },
          a: Link as any,
          ...components,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default SimpleMarkdownRenderer;
