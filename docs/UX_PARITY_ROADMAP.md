# PizzaPi UX Parity Roadmap

Goal: make `pi-web-app` feel comparable to PizzaPi as a product while keeping the same-server relay/orchestrator/runner deployment model.

## Scope boundary

In scope:

- Session navigation, live status, resume/search, and mobile drawer polish.
- Chat/runtime feedback: thinking, tool cards, pending questions, permissions, retry/abort, queue clarity.
- Workspace panels: file explorer, terminal, git status/diff, logs.
- Streaming reliability: event coalescing, replay deduplication, stale connection detection, gap repair.
- Product polish: command palette, shortcuts, preferences, notifications, model selector refinement.

Out of scope for UX parity:

- Hosted PizzaPi control plane.
- Remote multi-machine runner registration/auth.
- NPM/package distribution parity.
- Exact PizzaPi visual chrome if a pi-web-native UX is clearer.

## Phase checklist

### Phase 1 — Reliability foundation

- [x] Client-side SSE event-id tracking and reconnect with `lastEventId` query replay.
- [x] Duplicate replay protection using a bounded seen-event-id window.
- [x] Frame-level text chunk coalescing for smoother streaming updates.
- [x] Stale connection detection with forced reconnect when no payload arrives for 60s.
- [x] Sidebar session status badges for busy/retry/awaiting-input/error states.
- [ ] Full persisted message-part gap repair when replay history is insufficient.
- [ ] Background/global status subscription for sessions other than the selected session.

### Phase 2 — Sidebar/session product UX

- [x] Session search.
- [x] Rename/delete session actions.
- [x] Mobile drawer shell.
- [x] Live session status badges for the active stream.
- [ ] Project-grouped session sections across all projects.
- [ ] Copy session link / fork session.
- [ ] Cached instant session switching with stale-while-revalidate.
- [ ] Command palette for sessions/projects/actions/models.

### Phase 3 — Chat/runtime UX

- [x] Thinking stream rendering.
- [x] Expandable tool call/result blocks.
- [x] Visible abort/stop control.
- [ ] PizzaPi-level tool cards with status, type-specific icons, copy output, and formatted args.
- [ ] Pending question UI.
- [ ] Permission approve/deny UI.
- [ ] Busy queue/follow-up state.
- [ ] Todo panel/inline todos.

### Phase 4 — Workspace panels

- [ ] File explorer with read-only file viewer.
- [ ] Terminal panel scoped to CWD.
- [ ] Git panel with branch/status/diff.
- [ ] Logs/runtime panel.
- [ ] Dockable/resizable layout persisted in localStorage.

### Phase 5 — Preferences/model/product polish

- [ ] Command palette shortcuts.
- [ ] Preferences panel: theme, density, default model, auto-scroll, thinking visibility.
- [ ] Improved model selector: provider grouping, favorites, hidden models, reasoning/context badges.
- [ ] Usage/context indicator.
- [ ] Browser notifications for background completion/input-required.

## Current completed increment

The first UX-parity increment completes the reliability foundation visible to users:

- SSE reconnects preserve the last received event id.
- Replayed events are deduplicated client-side.
- Rapid text chunks are coalesced per animation frame.
- A stale stream forces a reconnect and surfaces degraded connection state.
- Session rows now show live status badges for working/retry/question/permission/error.

Verification for this increment:

- `npm run lint --workspace=frontend`
- `npm run test --workspace=frontend` → 75 tests passing
