import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SimpleMarkdownRenderer, normalizeMarkdownContent } from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('normalizes excessive blank lines', () => {
    const input = 'Line 1\n\n\n\nLine 2';
    expect(normalizeMarkdownContent(input)).toBe('Line 1\n\nLine 2');
  });

  it('renders normalized markdown without extra empty paragraphs', () => {
    render(<SimpleMarkdownRenderer content={'First\n\n\n\nSecond'} />);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(document.querySelectorAll('.markdown-body p')).toHaveLength(2);
  });

  it('renders gfm tables with table-specific classes', () => {
    render(
      <SimpleMarkdownRenderer
        content={'| Name | Value |\n| --- | --- |\n| cwd | /home/manu/pi-web-app |'}
      />,
    );

    expect(document.querySelector('.markdown-table-wrap')).not.toBeNull();
    expect(document.querySelector('.markdown-table')).not.toBeNull();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('/home/manu/pi-web-app')).toBeInTheDocument();
  });
});
