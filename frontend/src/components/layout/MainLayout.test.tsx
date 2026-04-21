import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MainLayout } from './MainLayout';

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
    matches,
    media: '(max-width: 1024px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

describe('MainLayout', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a sidebar backdrop on compact layouts', () => {
    mockMatchMedia(true);
    const onSidebarClose = vi.fn();

    render(
      <MainLayout
        sidebar={<div>Sidebar</div>}
        header={<div>Header</div>}
        content={<div>Content</div>}
        sidebarOpen
        onSidebarClose={onSidebarClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(onSidebarClose).toHaveBeenCalledTimes(1);
  });

  it('does not render the backdrop on desktop layouts', () => {
    mockMatchMedia(false);

    render(
      <MainLayout
        sidebar={<div>Sidebar</div>}
        header={<div>Header</div>}
        content={<div>Content</div>}
        sidebarOpen
      />,
    );

    expect(screen.queryByRole('button', { name: 'Close sidebar' })).not.toBeInTheDocument();
  });
});
