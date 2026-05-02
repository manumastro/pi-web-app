# OpenChamber UX Parity Roadmap

Goal: make `pi-web-app` mirror OpenChamber's visible UI/UX and runtime communication best practices while keeping the same-server Pi CLI/RPC wrapper deployment model.

## Scope boundary

In scope:

- Session navigation, live status, resume/search, and mobile drawer polish.
- Chat/runtime feedback: thinking, tool cards, pending questions, permissions, retry/abort, queue clarity.
- Workspace panels: file explorer, terminal, git status/diff, logs.
- Streaming reliability: event coalescing, replay deduplication, stale connection detection, gap repair.
- Product polish: command palette, shortcuts, preferences, notifications, model selector refinement.

Out of scope for UX parity:

- Hosted OpenChamber control plane.
- Remote multi-machine runner registration/auth.
- NPM/package distribution parity.
- Hosted/multi-machine internals remain out of scope, but visible chrome/UX should now be matched as closely as practical to OpenChamber.

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
- [x] Command palette for sessions/projects/actions/models (`Cmd/Ctrl+K`).

### Phase 3 — Chat/runtime UX

- [x] Thinking stream rendering.
- [x] Expandable tool call/result blocks.
- [x] Visible abort/stop control.
- [x] Tool cards expose status, type-specific icons, expandable formatted args/output, and copy controls.
- [ ] Tool cards still need richer per-tool metadata, duration/progress, and write/diff previews.
- [x] Pending question UI with answer transport.
- [x] Permission request UI shell remains visible-only by request; approve/deny transport intentionally not implemented.
- [ ] Busy queue/follow-up state.
- [ ] Todo panel/inline todos.

### Phase 4 — Workspace panels

- [x] OpenChamber-like dock panel shell for Files/Terminal/Git buttons in the main app chrome.
- [x] File explorer with read-only file viewer.
- [x] Terminal panel scoped to CWD with streaming output and kill support.
- [x] Git panel with branch/status/diff.
- [ ] Logs/runtime panel.
- [x] Dockable layout persisted in localStorage (open panel and desktop width persist; position still deferred).

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
- Command palette opens with `Cmd/Ctrl+K` and runs new-session/session/project/model commands.
- Tool cards now display explicit status and copy input/output content.
- Using OpenChamber at `/home/manu/openchamber` for direct UI reference and matching visible chrome 1:1: OpenChamber-style brand/header/sidebar, relay status header/sidebar, dark neutral tokens, session active chase border, header action cluster, and dock-panel shell for Files/Terminal/Git.
- Fixed session-list polish regressions: the active OpenChamber-style chase border is restored for the selected session, and first prompts now auto-name untitled sessions on both backend persistence and optimistic frontend state.
- Adopted OpenChamber's proxy-safe SSE practice for Pi Web event streams by disabling proxy buffering with `X-Accel-Buffering: no` while keeping `no-cache, no-transform` on session and terminal streams.
- Added OpenChamber-style resizable desktop workspace dock width with localStorage persistence and double-click reset.
- Switched the visible shell to OpenChamber Flexoki dark tokens, mono UI typography, 48px desktop header, rounded sidebar/content seam, and desktop header de-duplication so brand/status live in the sidebar like OpenChamber.
- Migration now consolidated: active frontend lives only in `frontend/src` (OpenChamber-aligned), with runtime/API adaptation done in-place for Pi Web.
- Replaced the active desktop sidebar container with a Pi-adapted OpenChamber `components/layout/Sidebar.tsx` frame/resizer, including OpenChamber width bounds and persisted desktop width.
- Replaced the active header shell with a Pi-adapted OpenChamber header transplant: 48px app-region header, compact session/project metadata, grouped Files/Terminal/Git tabs, and ghost action buttons.
- Added a one-shot OpenChamber transplant skin (`frontend/src/styles/openchamber-transplant.css`) over the current Pi-backed components so sidebar rows, message stream, tool/code surfaces, composer shell, model controls, context usage, and send/build buttons visually follow the vendored OpenChamber UI while preserving the existing Pi Web data flow.
- Replaced the active stylesheet layer with the upstream OpenChamber base CSS (`index.css`, `design-system.css`, `typography.css`, `mobile.css`) and cleared Pi-specific component CSS to remove visual conflicts.
- Replaced placeholder dock contents with real scoped workspace panels: Files lists/reads project files safely, Terminal can run a cwd-scoped command, and Git shows branch/status plus diffs.
- Added pending question/permission attention cards above the composer, wired question answers through REST → orchestrator → runner protocol, intentionally left permission approval transport out, and persisted the last open workspace dock panel in localStorage.
- Replaced direct runner-process runner usage with Pi RPC mode subprocesses (`pi --mode rpc`) per web session, matching the documented headless CLI/runtime transport instead of importing `Pi CLI` in backend source.
- Upgraded Terminal dock from one-shot command output to SSE streaming output with kill support.

Verification for this increment:

- `npm run lint --workspace=frontend`
- `npm run test --workspace=frontend` → 79 tests passing
- `npm run build --workspace=frontend`
- `npm run build --workspace=backend`
- `npm run test --workspace=backend` → 95 tests passing

## Immediate remaining steps

Continue strict OpenChamber UI/UX replication in this order:

1. **Workspace panel hardening**
   - Highlight files touched by agent tool calls.
   - Add multiple terminal tabs/history on top of the streaming process session.
   - Add dock width/position persistence and richer mobile bottom-sheet behavior.

2. **Pending question/permission hardening**
   - Support multiple-choice question answers when payloads include options.
   - Keep permission request transport intentionally deferred until explicitly needed.
   - Remember safe permission choices per session/project only if supported by the runner and enabled later.

3. **Dock layout persistence**
   - Width now persists in localStorage; position remains deferred.
   - Mobile bottom-sheet behavior for panels.
   - Later: full OpenChamber-style multi-position dock layout.

4. **Richer tool/runtime cards**
   - Tool duration/progress.
   - Per-tool metadata and icons matching OpenChamber more closely.
   - Write/edit diff preview.
   - Better failed-tool recovery/retry affordances.

5. **Final product polish**
   - Preferences dialog parity: theme, density, default model, thinking visibility, shortcuts.
   - Usage/context indicator.
   - Browser notifications for background completion/input-required.
   - Full mobile QA against OpenChamber behavior.
