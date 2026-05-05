import React from 'react';
import { MarkdownRendererImpl } from './MarkdownRendererImpl';

const fallback = <div className="break-words w-full min-w-0" />;

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => (
  <React.Suspense fallback={fallback}>
    <MarkdownRendererImpl content={content} />
  </React.Suspense>
);

export const SimpleMarkdownRenderer: React.FC<{ content: string }> = ({ content }) => (
  <React.Suspense fallback={fallback}>
    <MarkdownRendererImpl content={content} />
  </React.Suspense>
);
