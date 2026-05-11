import type { Part } from '@opencode-ai/sdk/v2';

type PartRecord = Record<string, unknown>;

function getPartTextLikeValue(part: Part): string {
    const record = part as PartRecord;
    const text = typeof record.text === 'string' ? record.text : '';
    const content = typeof record.content === 'string' ? record.content : '';
    const value = typeof record.value === 'string' ? record.value : '';
    return [text, content, value].reduce((best, next) => (next.length > best.length ? next : best), '');
}

function getPartEndTime(part: Part): number | undefined {
    const stateEnd = (part as { state?: { time?: { end?: unknown } } }).state?.time?.end;
    if (typeof stateEnd === 'number') {
        return stateEnd;
    }

    const timeEnd = (part as { time?: { end?: unknown } }).time?.end;
    return typeof timeEnd === 'number' ? timeEnd : undefined;
}

function getToolStatus(part: Part): string | undefined {
    if (part.type !== 'tool') {
        return undefined;
    }

    const status = (part as { state?: { status?: unknown } }).state?.status;
    return typeof status === 'string' ? status : undefined;
}

function getToolIdentity(part: Part): string {
    const record = part as PartRecord;
    const toolName = typeof record.tool === 'string'
        ? record.tool
        : typeof record.name === 'string'
            ? record.name
            : '';
    const callId = typeof record.callID === 'string'
        ? record.callID
        : typeof record.toolCallID === 'string'
            ? record.toolCallID
            : '';
    return `${toolName}:${callId}`;
}

export function getPartLaneKey(part: Part): string {
    if (part.type === 'tool') {
        return `tool:${getToolIdentity(part)}`;
    }
    return part.type;
}

function getPartRank(part: Part): [number, number, number, number] {
    const finalized = typeof getPartEndTime(part) === 'number' || Boolean(getToolStatus(part));
    const textLikeValueLength = getPartTextLikeValue(part).length;
    const endTime = getPartEndTime(part) ?? 0;
    return [finalized ? 1 : 0, endTime, textLikeValueLength, part.type === 'tool' ? 1 : 0];
}

function preferCanonicalPart(existing: Part, candidate: Part): boolean {
    if (existing.type !== candidate.type) {
        return false;
    }

    if (existing.type === 'tool') {
        const existingStatus = getToolStatus(existing);
        const candidateStatus = getToolStatus(candidate);
        const existingFinal = Boolean(existingStatus && ['completed', 'error', 'aborted', 'failed', 'timeout', 'cancelled'].includes(existingStatus));
        const candidateFinal = Boolean(candidateStatus && ['completed', 'error', 'aborted', 'failed', 'timeout', 'cancelled'].includes(candidateStatus));
        if (candidateFinal !== existingFinal) {
            return candidateFinal;
        }
    }

    const [existingFinal, existingEnd, existingLen] = getPartRank(existing);
    const [candidateFinal, candidateEnd, candidateLen] = getPartRank(candidate);

    if (candidateFinal !== existingFinal) {
        return candidateFinal > existingFinal;
    }
    if (candidateEnd !== existingEnd) {
        return candidateEnd > existingEnd;
    }
    if (candidateLen !== existingLen) {
        return candidateLen > existingLen;
    }

    return true;
}

export function canonicalizeParts(parts: Part[]): Part[] {
    if (parts.length < 2) {
        return parts;
    }

    const byLane = new Map<string, { index: number; part: Part }>();

    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (!part || !part.type) {
            continue;
        }

        const laneKey = getPartLaneKey(part);
        const existing = byLane.get(laneKey);
        if (!existing) {
            byLane.set(laneKey, { index, part });
            continue;
        }

        if (preferCanonicalPart(existing.part, part)) {
            byLane.set(laneKey, { index: existing.index, part });
        }
    }

    return Array.from(byLane.values())
        .sort((left, right) => left.index - right.index)
        .map((entry) => entry.part);
}
