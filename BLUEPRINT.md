# Pi Web Blueprint

> Current source of truth after the 2026-04-29 audit/fix pass. Pi Web is a web wrapper around the official Pi CLI/RPC integration, not a fork of Pi.

## 1. Product

Pi Web provides a browser UI for daily Pi coding-agent sessions:

- project/session sidebar backed by Pi session files and Pi Web metadata
- chat view with streaming assistant text, reasoning and tool blocks
- REST commands for session/model/prompt actions
- SSE for live session events
- production service on port `3210`

The app should stay thin: Pi remains responsible for agent behavior, tools, model auth, session runtime and RPC semantics.

## 2. Architecture

```
Browser React/Vite
  ├─ REST: /api/sessions, /api/messages, /api/models, /api/directories
  └─ SSE:  /api/events?sessionId=...
        ↓
Express backend
  ├─ SessionStore + JSON persistence
  ├─ SseManager + replay/gap support
  └─ RunnerOrchestrator
        ↓
Runner process bridge
  └─ official @mariozechner/pi-coding-agent RpcClient
        ↓
Pi CLI: node <pi>/dist/cli.js --mode rpc
```

Important rule: backend code must not reimplement Pi protocol details beyond normalizing official RPC events into Pi Web's SSE shape.

## 3. Current implementation snapshot

### Backend

- Express TypeScript backend.
- Persistent Pi Web session metadata under configured session directory.
- Imports/merges nested Pi CLI JSONL session snapshots when available.
- Runner bridge now uses Pi's official `RpcClient` instead of direct custom `spawn('pi', ['--mode','rpc'])` parsing.
- One official RPC client is managed per active Pi Web session.
- Model listing uses a short backend capabilities cache to avoid repeated Pi probe processes.
- Selected model is preserved in API output even if currently unavailable/auth-hidden.
- Runner errors now persist affected session status as `error`.
- SSE supports reconnect with event ids; fresh browser connections after REST hydration request no replay to avoid duplicating historical chunks.

### Frontend

- React + Vite + Zustand.
- URL-driven `cwd` and `sessionId` selection.
- OpenChamber-style layout and chat renderer.
- Sidebar has dedicated scrollable content region; toolbar/footer stay stable.
- Model picker supports search, providers, recent models and favorites.
- Model UI preferences now use localStorage directly and remain enabled even when heavyweight frontend cache is disabled.
- Model selection is optimistic but preserves selected key during refreshes.
- SSE batch reducer reconciles persisted session state after `done`/`idle`, including the batched event path.

## 4. Communication contracts

### REST

- `GET /api/config` (includes restart capability info)
- `GET /api/directories`
- `GET /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions`, `PUT /api/sessions/:id`, `DELETE /api/sessions/:id`
- `POST /api/messages/prompt`, `POST /api/messages/abort`
- `GET /api/models?sessionId=...`
- `PUT /api/models/session/model`
- `GET/PUT /api/models/session/thinking`
- `GET /api/maintenance/systemd`
- `POST /api/maintenance/restart` (primary)
- `POST /api/maintenance/systemd/restart` (compat alias)

### SSE events

Pi Web emits normalized events:

- `text_chunk`
- `thinking`
- `tool_call`
- `tool_result`
- `done`
- `status`
- `session_name`
- `error`

Fresh EventSource connections should normally use `replay=0` after REST hydration. Reconnects use `lastEventId`.

## 5. Operational notes

- Build command: `npm run build`.
- Test command: `npm test --workspaces` or targeted workspace tests.
- Production service: `systemctl --user restart pi-web` after production-impacting changes.
- If build fails with EACCES in `dist/public`, fix ownership: `sudo chown -R manu:manu /home/manu/pi-web-app/dist`.

### Restart controls (web + backend)

Restart is config-driven and guarded. Backend exposes `/api/maintenance/restart` and frontend shows a restart action only when enabled.

Supported restart strategies:
- `disabled` (default)
- `systemd-user` (`systemctl --user restart <service>`)
- `systemd-system` (`systemctl restart <service>`)
- `command` (custom shell command)

Environment variables:
- `PI_WEB_ALLOW_SYSTEMD_RESTART=true` enables systemd-based restart.
- `PI_WEB_RESTART_SCOPE=user|system` selects user/system systemd scope.
- `PI_WEB_SYSTEMD_SERVICE=pi-web` selects service name.
- `PI_WEB_SYSTEMD_USER=<user>` optional root→user fallback for agent/sandbox environments.
- `PI_WEB_RESTART_COMMAND="..."` enables command strategy (overrides systemd strategy).
- `PI_WEB_RESTART_STATUS_COMMAND="..."` optional command to report active status.

Notes:
- In sandbox/root agents, plain `systemctl --user` may fail due to missing user DBus env; root→user fallback is implemented in backend.
- Manual fallback command pattern: `sudo -u <user> env XDG_RUNTIME_DIR=/run/user/<uid> DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/<uid>/bus systemctl --user restart <service>`. 

## 6. Known history / why code looks this way

Earlier versions used a custom multi-layer CLI wrapper and broad OpenChamber UI migration. That left some duplicated CSS and conservative compatibility code. The current direction is to simplify around Pi's official RPC client while preserving the existing REST/SSE web contract.

## 7. Current priorities

1. Keep build/test green.
2. Avoid custom Pi protocol handling; prefer official `RpcClient` or SDK APIs.
3. Keep sidebar/model/stream UX deterministic under large session counts and reconnects.
4. Continue reducing duplicate CSS and stale migration artifacts.
5. Add E2E coverage for long sidebars, model favorites persistence and stream reconnect/reconcile.

## 8. Status Snapshot

2026-05-03: Fixed twenty-six production blockers after modular API rollout: (1) `GET /api/git/worktrees/bootstrap-status` now returns the typed contract expected by frontend (`{ status, error, updatedAt }`) instead of a custom `{ bootstrapped }` payload, which stopped runaway polling loops and unblocked message send paths waiting on bootstrap readiness; (2) `prompt_async` now handles stale client model keys more safely by selecting a valid fallback model from `runner.listModels()` when the requested model is not found; (3) restored frontend compatibility endpoint `POST /api/sessions/:sessionId/message-sent` (204 no-op), eliminating send-time 404 noise in browser console; (4) `/api/agent` now returns a default bootstrap agent instead of `[]`, stopping repeated agent reload storms on startup; (5) preserved frontend message reconciliation IDs by keeping local message records when merging Pi snapshots and exposing `messageId` as external API identity, which fixes cases where freshly sent user messages degraded to placeholder UI (`?`); (6) added frontend guardrails to avoid redundant state writes in `setCurrentSession` and `setDirectory`, reducing risk of React maximum update-depth loops in noisy event/selection paths; (7) fixed duplicate message IDs in `/api/session/:id/message` by using client `messageId` only for user messages and internal IDs for assistant messages, preventing user/assistant key collisions that could destabilize chat rendering (React #185); (8) separated assistant streaming/event message IDs from user prompt message IDs in the runner orchestrator so `thinking/tool/text/done` updates no longer target the optimistic user message key, reducing render-loop and part-merge instability during active turns; (9) added explicit client-error telemetry (`POST /api/client-error`) and wired ChatErrorBoundary to report component stacks in production, enabling deterministic tracing of remaining React update-depth loops; (10) fixed frontend sync handling for part-first streams by materializing a synthetic assistant message on `message.part.updated` when `message.updated` has not arrived yet, preventing turns that show “Working” briefly and then render no assistant output despite successful backend completion; (11) fixed empty-state send routing by creating a session on-demand when `currentSessionId` is null and rejecting empty `sessionId` sends in `routeMessage`, preventing silent no-op sends and unintended model/session fallback behavior on first message; (12) completed the OpenCode SDK message contract for Pi-backed sessions by returning user `agent/model` and assistant `providerID/modelID/path/tokens` metadata, plus backend default model settings/provider defaults, preventing OpenChamber from falling back to Gemma/unknown `?` rendering when displaying Pi wrapper sessions; (13) fixed live-stream compatibility by emitting OpenCode-style `message.updated` events for the optimistic user message and assistant turn before text parts, and by deriving assistant stream IDs as `${userMessageId}_assistant` so OpenChamber's id-sorted message arrays keep user→assistant order both live and after reload; (14) fixed live token rendering by initializing text/reasoning parts once and then emitting `message.part.delta` events, rather than repeatedly sending `message.part.updated` with only the latest chunk, which caused the UI to display only the final character/chunk and made streaming animation janky; (15) improved perceived OpenChamber streaming smoothness for bursty Pi RPC output by flushing SSE writes immediately, disabling socket buffering on SSE routes, and frame-smoothing only visible text deltas while leaving reasoning/non-text events unthrottled so hidden reasoning does not artificially delay the visible answer; (16) matched OpenChamber's pending-turn semantics by announcing an incomplete assistant `message.updated` immediately after the user message, then sending a final completed `message.updated` on `done`, so the Working placeholder transitions into the same assistant turn instead of disappearing abruptly before the stream appears; (17) made the Working/Retry placeholder visibly animated with robust staggered dot animation plus entry animation, preserving reduced-motion behavior while avoiding a static-looking placeholder during longer Pi startup gaps; (18) fixed tool-call fidelity by preserving tool names/state across live `tool_result` updates and by attaching persisted tool call/result records to the assistant message in SDK snapshots, so reloads show the same tool activity instead of hiding or partially rendering tool calls; (19) fixed final live role corruption after tool-using turns by ensuring final `done` → `message.updated` resolves only stored assistant messages, not earlier tool_call/tool_result records that share the same assistant external id, preventing the assistant answer from being reclassified/rendered as a user message; (20) fixed repeated "Add project directory" prompts on refresh by hydrating the local projects store from backend `project.list` before showing the first-run directory dialog, so existing backend projects are reattached automatically instead of being treated as an empty setup; (21) fixed false "No sessions yet" empty states after refresh by forcing directory alignment to the active hydrated project when local session cache is empty, ensuring sync bootstrap targets the correct project directory and loads existing sessions instead of showing a first-run sidebar; (22) added sidebar empty-state recovery that repopulates global session snapshot from directory-scoped `session.list` when startup data comes back empty, preventing persistent empty sidebar despite successful `/api/session` responses visible in network; (23) added a final fallback in sidebar project rendering: when project store hydration is empty, derive temporary project sections directly from loaded session directories so sessions remain visible instead of showing a false "No sessions yet" state; (24) fixed appearance settings reverting after reload by syncing visual controls (UI/code font, interface/terminal size, spacing density, input bar offset) to shared settings on change, preventing server settings sync from overwriting local choices with stale defaults on startup; (25) fixed theme mode reversion (e.g., light returning to dark) by adding immediate, non-debounced flush support for settings writes and using it for theme persistence, so `themeMode`/`themeVariant`/`useSystemTheme` updates land before reload and are not overwritten by stale server settings during startup sync; (26) restored OpenChamber compatibility for configuration reload actions by implementing `POST /api/config/reload` and further hardening explicit theme setters (`setTheme`/`setThemeMode`/`setSystemPreference`) to immediately persist next theme prefs, preventing stale dark defaults from reasserting after manual reload flows. Backend/frontend tests are green and service restarted.

2026-05-02: Backend API compatibility layer was refactored from a single monolithic file into modular route files under `backend/src/api/routes/*` plus shared mappers/helpers (`api/sdk/*`, `api/shared/*`), while keeping the same `/api/*` contract (including legacy `/api/openchamber/*` endpoints still consumed by frontend stores). A new backend integration suite now validates session CRUD/prompt/provider/model/filesystem/git/global-event contracts (`backend/src/api/routes/install.test.ts`). Frontend test infrastructure was stabilized for Vitest (added `src/test/setup.ts` and a `bun:test` shim alias), and an additional hook regression test was added for model list safety (`src/hooks/useModelLists.test.tsx`) to prevent `undefined.length`-style crashes when provider model payloads are malformed. Workspace validation is green: `npm run build` and `npm test` both pass.

2026-05-01: OpenChamber web compatibility + infra cleanup completed: frontend no longer crashes on missing legacy runtime injection (web fallback runtime now provided), backend exposes compatibility endpoints `GET/PUT /api/config/settings` and `GET /api/fs/home`, stale asset paths now return 404 (no HTML fallback for `/assets/*`/`/api/*`), duplicate root systemd `pi-web` service on `:3210` was disabled, nginx now proxies `piwebapp.duckdns.org` to user service `:3211`, browser branding/title was switched from Pi Web to OpenChamber, and additional SDK bootstrap routes (`/api/session`, `/api/experimental/session`, `/api/project`, `/api/fs/list`, `/api/config/themes`, `/api/github/auth/status`, `/api/global/config`, `/api/command`, `/api/lsp`, `/api/mcp`, `/api/question`, `/api/permission`, etc.) were added to stop 404 retry storms.

2026-05-01: OpenChamber parity pass started from `/home/manu/openchamber`: SSE endpoints now share proxy-safe event-stream headers (`Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`) for chat/session and terminal streams while preserving the Pi CLI/RPC wrapper architecture; the workspace dock now has OpenChamber-style desktop width resizing with localStorage persistence and double-click reset; the global shell now uses OpenChamber Flexoki dark theme tokens, mono UI typography, 48px desktop header, rounded content/sidebar seam, and de-duplicated desktop header brand/status chrome; the active desktop sidebar frame/resizer is now a Pi-adapted transplant of OpenChamber `components/layout/Sidebar.tsx`; the active header is now a Pi-adapted transplant of OpenChamber's 48px drag/header shape with session metadata, grouped workspace tabs, and ghost icon actions; the active frontend stylesheet layer has now been replaced with the upstream OpenChamber base CSS and the Pi-specific component CSS has been cleared out to remove visual conflicts.

2026-05-01: Follow-up integration pass in source: made session listing lightweight by serving summaries without message bodies while keeping full snapshot hydration on selected-session load, fixed the official Pi `RpcClient` loader to resolve the package on-disk dist path, replaced working-status context-window text with live activity-aware previews (thinking/writing/tooling), added a persistent CLI-like composer status line near the input (↑/↓/R/$ and context %/window with auto/manual flag) backed by enriched RPC metadata (`getSessionStats` + `getState`, including cost and auto-compaction), fixed directory snapshot rehydration so it preserves live `session_status.metadata` instead of wiping it (which previously caused context stats to flash briefly and disappear), fixed first-turn send flashing by preventing `onConnected` SSE handshake from downgrading an already-optimistic streaming state back to idle, restored inline working placeholders in the active assistant turn until first text chunk to avoid detached working-card appear/disappear behavior, aligned session ordering with CLI by sorting `listSessions()` by `createdAt` descending, and made session storage match Pi CLI format: sessions are now loaded from both root and cwd subdirectories (recursive scan), Pi CLI session files are parsed into web format automatically, and new sessions created from the web app are saved to CLI-style subdirectories (`{sessionsDir}/{cwd-path}/{timestamp}_{uuid}.jsonl`) with automatic root-file cleanup on write — plus reload-resume now uses a stable last-user fallback so a running assistant does not spawn a duplicate block after refresh, mobile composer now surfaces full context telemetry (↑/↓/R/$ + usage + auto/manual) inline and in the controls sheet (including detailed cache/token breakdown) so advanced context data remains visible on touch devices, the inline working placeholder reports operational runtime state (tooling/permission/retry/writing) instead of mirroring thinking text, reasoning timeline summaries auto-refresh from the latest `**...**` marker in incoming thinking chunks, completed turns now force a bottom re-anchor pass to prevent post-answer upward jump, runtime context telemetry (`statusMessage`/`statusMetadata`) is persisted in session snapshots and rehydrated immediately on reload or session switch-back, model picker preferences (favorites, recents, collapsed providers) are now persisted server-side via a JSON-backed preferences store (`~/.pi/agent/pi-web-preferences.json`) exposed through `/api/preferences/models` so they survive reloads and browser changes, generic runtime placeholders like “Preparing...” are now suppressed so the inline working placeholder keeps showing live phase/tool activity labels (e.g. `Running web_search`), and image upload is now end-to-end for vision-capable models: backend exposes `/api/uploads/image` with persisted upload metadata plus session-scoped file serving, prompt payloads can reference uploaded images, uploads are binary + session-scoped (10MB max, auto-removed when the session is deleted), the nginx vhost now allows 10MB request bodies, the model capability layer now infers image input for known vision families (including `openai-codex/gpt-5.*`) when upstream metadata is incomplete, the frontend model picker shows explicit input-type chips (TXT/IMG), and uploaded images render inline as part of the user message input while attachments are enabled only when image input is supported; additionally, the compact mobile composer footer now uses explicit 3-slot/4-slot grid variants (without/with thinking) so add-image, model, thinking, and send controls remain aligned on a single row instead of collapsing into a skewed stacked layout, and expanded reasoning blocks now auto-scroll to the latest lines when opened so the newest thinking is visible first; reconnect/load now reattaches the active assistant turn conservatively when the session is still running, preventing duplicate assistant cards and disappearing working placeholders after reconnect; fresh session re-entry now also restores the last SSE replay cursor per session from browser storage so navigating away, reloading, or reopening the same running session can replay the missing tool/thinking/text events instead of leaving the composer stuck on Stop, and the live turn snapshot itself is now mirrored in sessionStorage so the current UI state can be restored exactly across reloads; idle sessions now deliberately do not resubscribe to SSE, so returning to a completed turn keeps the authoritative server snapshot instead of replaying stale partial UI, and the composer action bar now stays on one line by removing the focus/preset controls, keeping the remaining actions inside the panel on narrower desktop widths.
