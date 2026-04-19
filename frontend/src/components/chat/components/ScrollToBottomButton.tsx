import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
  className?: string;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  visible,
  onClick,
  className,
}) => {
  return (
    <button
      type="button"
      className={cn('scroll-to-bottom-button', visible && 'visible', className)}
      onClick={onClick}
      aria-label="Scroll to bottom"
      title="Scroll to bottom"
    >
      <ChevronDown size={18} />
    </button>
  );
};

export default ScrollToBottomButton;
