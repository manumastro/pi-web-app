import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type MarkdownVariant = 'default' | 'simple';

export const MarkdownRendererImpl: React.FC<{ content: string; variant?: MarkdownVariant }> = ({ content }) => {
  return (
    <div className="oc-markdown break-words w-full min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
};
