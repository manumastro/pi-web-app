import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToolPart } from './ToolPart';

describe('ToolPart', () => {
  beforeEach(() => {
    Element.prototype.animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() })) as never;
  });

  it('shows status and copies expanded output', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ToolPart
        toolId="tool-1"
        toolName="bash"
        input={JSON.stringify({ command: 'npm test' })}
        output="all green"
        status="success"
      />,
    );

    expect(screen.getByText('success')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy tool output' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('all green'));
  });
});
