import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked
marked.setOptions({ breaks: true });

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function renderMarkdown(text: string): string {
  if (!text) return '';
  return marked.parse(text) as string;
}

export function escapeAndMarkdown(text: string): string {
  if (!text) return '';
  return escapeHtml(text);
}

export function highlightCodeBlocks(element: HTMLElement) {
  element.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block as HTMLElement);
  });
}
