# Session Resumption / Live State Plan

## Goal
Make session execution and the internal architecture feel identical to OpenChamber when the user reloads, switches tabs, or leaves and returns to a running session. This is a **technical parity target**: we must replicate the OpenChamber architecture and internal flow **100%**, not just the user-visible behavior:

- the backend remains authoritative for session lifecycle state
- the frontend rehydrates that state on entry through the same sync/bootstrap-style flow
- a running session must still render as running even if the user left and came back
- the visible state must be derived from persisted/live session status, not only from local transport state
- the internal module layout, responsibilities, and data flow must converge to the OpenChamber sync architecture 1:1

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

### OpenChamber-style file parity matrix

| OpenChamber file / module | Current pi-web-app equivalent | Status | Notes |
|---|---|---|---|
| `packages/ui/src/sync/bootstrap.ts` | `frontend/src/sync/bootstrap.ts` | implemented | hydrates the selected session snapshot on load/re-entry |
| `packages/ui/src/sync/event-reducer.ts` | `frontend/src/sync/event-reducer.ts` | implemented | handles SSE completion/error lifecycle transitions |
| `packages/ui/src/sync/live-aggregate.ts` | `frontend/src/sync/live-aggregate.ts` | implemented | live session/status aggregation helpers are now split into the sync layer |
| `packages/ui/src/sync/sync-context.tsx` | `frontend/src/sync/sync-context.tsx` | implemented | hook surface now reads from the sync child-store topology |
| `packages/ui/src/sync/index.ts` | `frontend/src/sync/index.ts` | implemented | aggregate export surface mirrors the OpenChamber sync entrypoint |
| `packages/ui/src/sync/use-sync.ts` | `frontend/src/sync/use-sync.ts` | implemented | session action bindings now live behind the sync hook surface |
| `packages/ui/src/sync/global-sync-store.ts` | `frontend/src/sync/global-sync-store.ts` | implemented | parity scaffolding for global sync state |
| `packages/ui/src/sync/session-actions.ts` | `frontend/src/sync/session-actions.ts` | implemented | session CRUD/model/prompt actions now live in the sync layer |
| `packages/ui/src/sync/sync-refs.ts` | `frontend/src/sync/sync-refs.ts` | implemented | selector helpers and stable access patterns are now split out |
| `packages/ui/src/sync/child-store.ts` | `frontend/src/sync/child-store.ts` | implemented | per-directory store topology is now represented explicitly |
| `packages/ui/src/sync/session-cache.ts` | `frontend/src/sync/session-cache.ts` | implemented | sync-layer cache eviction helpers are now available |
| `packages/ui/src/sync/session-prefetch-cache.ts` | `frontend/src/sync/session-prefetch-cache.ts` | implemented | prefetch TTL/inflight cache helpers are now available |
| `packages/ui/src/sync/streaming.ts` | none / partial `frontend/src/sync/sessionActivity.ts` | partial | activity/streaming derivation exists, but not as a dedicated streaming module yet |
| `packages/ui/src/sync/optimistic.ts` | `frontend/src/sync/optimistic.ts` | implemented | optimistic page/message merge helpers now exist in the sync layer |
| `packages/ui/src/sync/persist-cache.ts` | `frontend/src/sync/persist-cache.ts` | implemented | directory metadata persistence helpers now exist in the sync layer |
| `packages/ui/src/sync/notification-store.ts` | `frontend/src/sync/notification-store.ts` | implemented | session/project notification counters and viewed state now exist |
| `packages/ui/src/sync/input-store.ts` | `frontend/src/sync/input-store.ts` | implemented | pending input/attachment state now exists in the sync layer |
| `packages/ui/src/sync/selection-store.ts` | `frontend/src/sync/selection-store.ts` | implemented | session/model selection maps now exist in the sync layer |
| `packages/ui/src/sync/viewport-store.ts` | `frontend/src/sync/viewport-store.ts` | implemented | viewport/session memory state now exists in the sync layer |
| `packages/ui/src/sync/voice-store.ts` | `frontend/src/sync/voice-store.ts` | implemented | voice connection/mode state now exists in the sync layer |
| `packages/ui/src/hooks/useSessionActivity.ts` | removed | removed | the compatibility wrapper was deleted once all imports moved to the sync layer |

### Frontend current candidates that still need decomposition
- `frontend/src/App.tsx` — now a thin composition shell; lifecycle/bootstrap/selection orchestration has been moved into `frontend/src/sync/use-app-controller.ts`
- `frontend/src/sync/use-app-controller.ts` — orchestration surface for loading, selection, and event wiring
- `frontend/src/stores/sessionStore.ts` — session list and status store
- `frontend/src/stores/sessionUiStore.ts` — session selection and current-visible-session store
- `frontend/src/chatState.ts` — conversation rehydration is correct for the current behavior, but long-term OpenChamber parity requires the sync-layer to own the equivalent lifecycle wiring
- `frontend/src/components/chat/*` / `frontend/src/components/session/*` — UI consumers will need to bind to the final sync-layer selectors once the full decomposition lands

## Implementation phases

### Phase 1 — Rehydrate session activity from persisted status
- [x] introduce a small session-activity helper / hook layer in the frontend
- [x] make the selected session’s persisted status drive the visual working state
- [x] keep transport state separate from session lifecycle state
- [x] update the selected session snapshot when loading a session from the backend
- [x] clear the selected session snapshot when `done` / `error` arrives

### Phase 2 — Align file structure with OpenChamber-style separation
- [x] split the remaining session lifecycle orchestration from `App.tsx`
- [x] split `sessionStore.ts` into sync-like session/session-ui responsibilities
- [x] port the remaining sync primitives (notification/input/selection/viewport/voice modules or exact equivalents)
- [x] keep activity derivation in a dedicated hook/helper pair
- [x] keep status mapping reusable for chat/status row/composer
- [x] add unit tests for the new helper/hook behavior
- [x] introduce explicit sync child-store / refs / global-store scaffolding
- [x] port `use-sync.ts` and `session-actions.ts` into the sync layer
- [x] port the cache/persist/optimistic/session-prefetch modules into the sync layer

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
- [ ] Full OpenChamber sync topology is still incomplete: `frontend/src/chatState.ts` is the remaining non-sync conversation helper surface pending final absorption.
- [x] Sync-layer action facade added: `use-sync.ts` now binds `session-actions.ts` for create/delete/rename/model/prompt/abort flows.
- [x] Cache/prefetch/optimistic persistence helpers now exist in the sync layer, with coverage for cache eviction, prefetch TTLs, optimistic merges, and local metadata persistence.
- [x] Auxiliary sync stores now exist for notification, input, selection, viewport, and voice state.

## Notes

OpenChamber parity target file map:
- `frontend/src/sync/sessionActivity.ts` — OpenChamber-style status helpers, now the canonical frontend activity utility
- `frontend/src/sync/sync-context.tsx` — OpenChamber-style hook surface for session status/activity backed by the session store
- `frontend/src/sync/bootstrap.ts` — session snapshot hydration on load/re-entry
- `frontend/src/sync/event-reducer.ts` — SSE lifecycle reducer for done/error state transitions
- `frontend/src/sync/child-store.ts` — explicit per-directory store topology
- `frontend/src/sync/global-sync-store.ts` — global sync state scaffold
- `frontend/src/sync/live-aggregate.ts` — live session/status aggregation helpers in sync form
- `frontend/src/sync/session-actions.ts` — session CRUD/model/prompt actions now delegated out of `App.tsx`
- `frontend/src/sync/session-cache.ts` — session cache eviction helpers
- `frontend/src/sync/session-prefetch-cache.ts` — prefetch TTL/inflight cache helpers
- `frontend/src/sync/optimistic.ts` — optimistic merge helpers for session/message flows
- `frontend/src/sync/persist-cache.ts` — directory metadata persistence helpers
- `frontend/src/sync/notification-store.ts` — notification counters/viewed state
- `frontend/src/sync/input-store.ts` — pending input and attachment state
- `frontend/src/sync/selection-store.ts` — session/model selection maps
- `frontend/src/stores/sessionUiStore.ts` — session selection / current-visible-session store
- `frontend/src/sync/viewport-store.ts` — viewport/session memory state
- `frontend/src/sync/voice-store.ts` — voice connection/mode state
- `frontend/src/sync/sync-refs.ts` — imperative selector/refs surface for the sync system
- `frontend/src/sync/use-sync.ts` — hook-level action facade for sync-layer session operations
- `frontend/src/sync/index.ts` — aggregate export surface mirroring the OpenChamber sync entrypoint
- `frontend/src/stores/sessionUiStore.ts` — session selection / current-visible-session store
- `frontend/src/chatState.ts` — conversation rehydration helper that injects a running assistant placeholder for resumed busy sessions
- `frontend/src/App.tsx` — composition shell over `frontend/src/sync/use-app-controller.ts`
- `frontend/src/sync/use-app-controller.ts` — app lifecycle/bootstrap/selection orchestration and view-model aggregation

Remaining work for exact 1:1 parity: decide whether `chatState.ts` should also be absorbed into the sync-layer conversation helpers. The acceptance criterion is **100% technical architecture parity** with OpenChamber.
