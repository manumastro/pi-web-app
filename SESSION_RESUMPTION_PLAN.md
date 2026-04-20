# Session Resumption / Live State Plan

## Goal
Make session execution feel identical to OpenChamber when the user reloads, switches tabs, or leaves and returns to a running session:

- the backend remains authoritative for session lifecycle state
- the frontend rehydrates that state on entry
- a running session must still render as running even if the user left and came back
- the visible state must be derived from persisted/live session status, not only from local transport state

## Reference behavior from OpenChamber

OpenChamber keeps the running state in a live, authoritative `session_status` map and rehydrates it through sync/bootstrap rather than relying on local tab state.

### Relevant OpenChamber files
- `packages/web/server/lib/opencode/session-runtime.js`
- `packages/ui/src/sync/bootstrap.ts`
- `packages/ui/src/sync/event-reducer.ts`
- `packages/ui/src/sync/live-aggregate.ts`
- `packages/ui/src/sync/sync-context.tsx`
- `packages/ui/src/hooks/useSessionActivity.ts`

### Key behavior to mirror
- `session.status` is authoritative and survives navigation
- bootstrap restores it on load
- `useSessionActivity` derives working/idle from that authoritative status
- live aggregation keeps the sidebar/session list visually stable across switches
- a busy session stays visually busy until completion is received

## Current repo mapping

### Backend already in place
- `backend/src/sessions/store.ts`
- `backend/src/sessions/persistence.ts`
- `backend/src/sessions/persistent-store.ts`
- `backend/src/sdk/bridge.ts`
- `backend/src/sse/*`

### Frontend current candidates
- `frontend/src/App.tsx`
- `frontend/src/stores/sessionStore.ts`
- `frontend/src/hooks/useSessionStream.ts`
- `frontend/src/components/chat/*`
- `frontend/src/components/session/*`

## Implementation phases

### Phase 1 — Rehydrate session activity from persisted status
- [x] introduce a small session-activity helper / hook layer in the frontend
- [x] make the selected session’s persisted status drive the visual working state
- [x] keep transport state separate from session lifecycle state
- [x] update the selected session snapshot when loading a session from the backend
- [x] clear the selected session snapshot when `done` / `error` arrives

### Phase 2 — Align file structure with OpenChamber-style separation
- [ ] split session lifecycle logic from `App.tsx`
- [x] keep activity derivation in a dedicated hook/helper pair
- [x] keep status mapping reusable for chat/status row/composer
- [x] add unit tests for the new helper/hook behavior

### Phase 3 — Verify and document
- [x] run backend/frontend tests
- [x] run build
- [x] update this plan with the implemented file map and any remaining gaps
- [x] update `BLUEPRINT.md` / `AGENTS.md` if the implementation changes the current state snapshot

## Progress log

- [x] Analysis completed: identified the gap between local transport state and authoritative session status.
- [x] OpenChamber reference behavior inspected: bootstrap + live session status + activity derivation.
- [x] Backend session status normalization already aligned to busy/idle semantics.
- [x] Frontend session activity rehydration implementation completed.
- [x] App-level visual state now rehydrates from authoritative session activity.
- [x] Tests cover the resumed-running-session case.

## Notes

Implemented file map:
- `frontend/src/sync/sessionActivity.ts` — OpenChamber-style status helpers, now the canonical frontend activity utility
- `frontend/src/hooks/useSessionActivity.ts` — hook wrapper for the selected session status
- `frontend/src/chatState.ts` — conversation rehydration helper that injects a running assistant placeholder for resumed busy sessions
- `frontend/src/App.tsx` — session load/selection now uses status-aware conversation rehydration
- `frontend/src/lib/sessionActivity.ts` — compatibility re-export while the codebase transitions to the sync-style layout

Remaining gap for exact 1:1 parity: the app still orchestrates session loading in `App.tsx` instead of a full `sync/bootstrap.ts` + `sync-context.tsx` split like OpenChamber, but the live-running visual state now behaves the same.
