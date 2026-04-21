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

  it('renders math and marks external links', () => {
    render(
      <SimpleMarkdownRenderer
        content={'Formula: $E=mc^2$\n\n[Docs](https://example.com)'}
        variant="assistant"
      />,
    );

    expect(document.querySelector('.katex')).not.toBeNull();
    const link = screen.getByRole('link', { name: /Docs/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('data-external-link', 'true');
    expect(document.querySelector('.markdown-assistant')).not.toBeNull();
  });

  it('renders code block toolbars for fenced code blocks', () => {
    render(
      <SimpleMarkdownRenderer
        content={'```js\nconsole.log("hi")\n```'}
      />,
    );

    expect(screen.getByLabelText('Copy code')).toBeInTheDocument();
    expect(screen.getByLabelText('Download code')).toBeInTheDocument();
    expect(document.querySelector('.markdown-code-toolbar')).not.toBeNull();
  });
});
