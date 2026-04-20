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
- [ ] introduce a small session-activity helper / hook layer in the frontend
- [ ] make the selected session’s persisted status drive the visual working state
- [ ] keep transport state separate from session lifecycle state
- [ ] update the selected session snapshot when loading a session from the backend
- [ ] clear the selected session snapshot when `done` / `error` arrives

### Phase 2 — Align file structure with OpenChamber-style separation
- [ ] split session lifecycle logic from `App.tsx`
- [ ] keep activity derivation in a dedicated hook/helper pair
- [ ] keep status mapping reusable for chat/status row/composer
- [ ] add unit tests for the new helper/hook behavior

### Phase 3 — Verify and document
- [ ] run backend/frontend tests
- [ ] run build
- [ ] update this plan with the implemented file map and any remaining gaps
- [ ] update `BLUEPRINT.md` / `AGENTS.md` if the implementation changes the current state snapshot

## Progress log

- [x] Analysis completed: identified the gap between local transport state and authoritative session status.
- [x] OpenChamber reference behavior inspected: bootstrap + live session status + activity derivation.
- [x] Backend session status normalization already aligned to busy/idle semantics.
- [ ] Frontend session activity rehydration implementation started.
- [ ] App-level visual state still needs to be switched to authoritative session activity.
- [ ] Tests still need to cover the resumed-running-session case.

## Notes

The first fix should be minimal and targeted: restore the authoritative running state from the selected session snapshot, then derive the visible working UI from that state instead of only from the ephemeral streaming flag.
