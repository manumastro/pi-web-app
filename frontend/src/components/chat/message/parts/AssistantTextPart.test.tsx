import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssistantTextPart } from './AssistantTextPart';

describe('AssistantTextPart', () => {
  it('renders markdown while streaming', () => {
    render(
      <AssistantTextPart
        text={'- alpha\n- beta\n\n`code`'}
        isStreaming
      />,
    );

    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(document.querySelectorAll('.markdown-body li')).toHaveLength(2);
    expect(document.querySelector('.inline-code')).not.toBeNull();
  });
});
