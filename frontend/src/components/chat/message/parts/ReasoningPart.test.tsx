import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReasoningPart } from './ReasoningPart';

describe('ReasoningPart', () => {
  it('uses the latest **...** segment as live summary when present', () => {
    const { container } = render(
      <ReasoningPart
        blockId="reasoning-1"
        text={'Sto analizzando\n**Calling read**\npoi continuo\n**Calling bash**'}
        isStreaming
      />,
    );

    expect(container.querySelector('.reasoning-summary-text')).toHaveTextContent('Calling bash');
  });
});
