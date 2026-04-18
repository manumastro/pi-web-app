import { useState } from 'react';
import type { QuestionItem } from '@/chatState';
import { Checkbox } from '@/components/ui';

interface QuestionCardProps {
  question: QuestionItem;
  onAnswer: (answer: string) => Promise<void>;
}

function QuestionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5.5 5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5c0 .83-.67 1.5-1.5 1.5v1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="7" cy="10" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function QuestionCard({ question, onAnswer }: QuestionCardProps) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggleOption = (option: string) => {
    setSelectedOptions((prev) => {
      if (prev.includes(option)) {
        return prev.filter((o) => o !== option);
      }
      return [...prev, option];
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const answerText = selectedOptions.join(', ') || customText;
    await onAnswer(answerText);
    setIsSubmitting(false);
  };

  const hasAnswer = selectedOptions.length > 0 || customText.trim().length > 0;

  return (
    <div className="question-card">
      <div className="question-header">
        <div className="question-icon">
          <QuestionIcon />
        </div>
        <span className="question-title">Input needed</span>
      </div>

      <div className="question-content">
        <p className="typography-ui-label font-medium mb-3">{question.question}</p>
        
        {question.options?.map((option: string) => {
          const isSelected = selectedOptions.includes(option);
          return (
            <label
              key={option}
              className="flex items-center gap-2 py-1 cursor-pointer hover:text-foreground transition-colors"
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => handleToggleOption(option)}
              />
              <span className="text-sm">{option}</span>
            </label>
          );
        })}

        <div className="mt-4 pt-4 border-t border-border">
          <textarea
            className="w-full p-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:border-accent resize-none"
            placeholder="Or write a custom answer..."
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="question-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void handleSubmit()}
          disabled={!hasAnswer || isSubmitting}
        >
          {isSubmitting ? 'Sending...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

export default QuestionCard;
