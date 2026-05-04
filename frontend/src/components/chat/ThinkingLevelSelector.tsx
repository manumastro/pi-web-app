import React from 'react';
import {
    RiBrainAi3Line,
    RiCheckLine,
    RiArrowDownSLine,
} from '@remixicon/react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useThinkingLevel, THINKING_LEVEL_LABELS, type ThinkingLevel } from '@/hooks/useThinkingLevel';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useI18n } from '@/lib/i18n';

interface ThinkingLevelSelectorProps {
    className?: string;
    compact?: boolean;
}

export const ThinkingLevelSelector: React.FC<ThinkingLevelSelectorProps> = ({
    className,
    compact = false,
}) => {
    const { t } = useI18n();
    const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
    const newSessionDraftOpen = useSessionUIStore((s) => s.newSessionDraft.open);
    const { currentLevel, availableLevels, loading, supported, setLevel } = useThinkingLevel();
    const [open, setOpen] = React.useState(false);

    if ((!currentSessionId && !newSessionDraftOpen) || !supported) {
        return null;
    }

    const getLevelLabel = (level: ThinkingLevel | null): string => {
        if (!level) return t('chat.thinkingLevel.default') || 'Default';
        return THINKING_LEVEL_LABELS[level] ?? level;
    };

    const displayLabel = getLevelLabel(currentLevel);

    if (compact) {
        return (
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-md text-xs',
                            'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                            'transition-colors border border-transparent hover:border-border',
                            loading && 'opacity-50 pointer-events-none',
                            className,
                        )}
                        aria-label={t('chat.thinkingLevel.ariaLabel') || 'Thinking level'}
                        title={t('chat.thinkingLevel.tooltip') || 'Set thinking level'}
                    >
                        <RiBrainAi3Line className="h-3.5 w-3.5" />
                        <span className="whitespace-nowrap">{displayLabel}</span>
                        <RiArrowDownSLine className="h-3 w-3 opacity-60" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" className="min-w-[140px]">
                    <DropdownMenuLabel className="typography-ui-header font-semibold text-foreground">
                        {t('chat.thinkingLevel.label') || 'Thinking Level'}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {availableLevels.map((level: ThinkingLevel) => (
                        <DropdownMenuItem
                            key={level}
                            onClick={() => {
                                void setLevel(level);
                                setOpen(false);
                            }}
                            className="flex items-center justify-between"
                        >
                            <span>{getLevelLabel(level)}</span>
                            {currentLevel === level && (
                                <RiCheckLine className="h-3.5 w-3.5 text-foreground ml-2" />
                            )}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <span className="text-xs text-muted-foreground">
                <RiBrainAi3Line className="h-3.5 w-3.5 inline mr-1" />
                {t('chat.thinkingLevel.label') || 'Thinking'}:
            </span>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-md text-xs',
                            'text-foreground bg-accent/30 hover:bg-accent/50',
                            'transition-colors border border-border',
                            loading && 'opacity-50 pointer-events-none',
                        )}
                    >
                        <span>{displayLabel}</span>
                        <RiArrowDownSLine className="h-3 w-3" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[140px]">
                    {availableLevels.map((level: ThinkingLevel) => (
                        <DropdownMenuItem
                            key={level}
                            onClick={() => {
                                void setLevel(level);
                                setOpen(false);
                            }}
                            className="flex items-center justify-between"
                        >
                            <span>{getLevelLabel(level)}</span>
                            {currentLevel === level && (
                                <RiCheckLine className="h-3.5 w-3.5 text-foreground" />
                            )}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
