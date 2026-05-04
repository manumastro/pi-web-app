import React from 'react';
import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';

interface SessionContextInfoProps {
    className?: string;
    compact?: boolean;
}

export const SessionContextInfo: React.FC<SessionContextInfoProps> = ({ className, compact = false }) => {
    const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
    const getContextUsage = useSessionUIStore((s) => s.getContextUsage);
    const getCurrentModel = useConfigStore((s) => s.getCurrentModel);
    const sessions = useSessions();

    if (!currentSessionId) return null;

    const model = getCurrentModel();
    const limit = model && typeof model.limit === 'object' && model.limit !== null
        ? (model.limit as Record<string, unknown>)
        : null;
    const contextLimit = limit && typeof limit.context === 'number' ? limit.context : 0;
    const outputLimit = limit && typeof limit.output === 'number' ? limit.output : 0;
    const usage = getContextUsage(contextLimit, outputLimit);

    const activeSession = sessions.find((s) => s.id === currentSessionId) as (Record<string, unknown> | undefined);
    const statusMetadata = activeSession?.statusMetadata as Record<string, unknown> | undefined;
    const runtimeTotalTokens = typeof statusMetadata?.contextUsed === 'number'
        ? statusMetadata.contextUsed
        : (typeof statusMetadata?.totalTokens === 'number' ? statusMetadata.totalTokens : undefined);
    const runtimeContextWindow = typeof statusMetadata?.contextWindow === 'number'
        ? statusMetadata.contextWindow
        : undefined;
    const runtimeContextPercent = typeof statusMetadata?.contextPercent === 'number'
        ? statusMetadata.contextPercent
        : (runtimeTotalTokens && runtimeContextWindow && runtimeContextWindow > 0
            ? Math.round((runtimeTotalTokens / runtimeContextWindow) * 100)
            : undefined);

    const totalTokens = runtimeTotalTokens ?? usage?.totalTokens;
    const percentage = runtimeContextPercent ?? usage?.percentage;
    const resolvedContextLimit = runtimeContextWindow ?? usage?.contextLimit ?? contextLimit;
    const resolvedOutputLimit = usage?.outputLimit ?? outputLimit;

    if (typeof totalTokens !== 'number' || typeof percentage !== 'number' || totalTokens <= 0) return null;

    return (
        <ContextUsageDisplay
            totalTokens={totalTokens}
            percentage={percentage}
            contextLimit={Math.max(resolvedContextLimit, 1)}
            outputLimit={resolvedOutputLimit}
            size={compact ? 'compact' : 'default'}
            className={cn(className)}
            showPercentIcon={compact}
        />
    );
};
