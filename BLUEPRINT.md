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

2026-05-01: Follow-up integration pass in source: made session listing lightweight by serving summaries without message bodies while keeping full snapshot hydration on selected-session load, fixed the official Pi `RpcClient` loader to resolve the package on-disk dist path, replaced working-status context-window text with live activity-aware previews (thinking/writing/tooling), added a persistent CLI-like composer status line near the input (↑/↓/R/$ and context %/window with auto/manual flag) backed by enriched RPC metadata (`getSessionStats` + `getState`, including cost and auto-compaction), fixed directory snapshot rehydration so it preserves live `session_status.metadata` instead of wiping it (which previously caused context stats to flash briefly and disappear), fixed first-turn send flashing by preventing `onConnected` SSE handshake from downgrading an already-optimistic streaming state back to idle, restored inline working placeholders in the active assistant turn until first text chunk to avoid detached working-card appear/disappear behavior, aligned session ordering with CLI by sorting `listSessions()` by `createdAt` descending, and made session storage match Pi CLI format: sessions are now loaded from both root and cwd subdirectories (recursive scan), Pi CLI session files are parsed into web format automatically, and new sessions created from the web app are saved to CLI-style subdirectories (`{sessionsDir}/{cwd-path}/{timestamp}_{uuid}.jsonl`) with automatic root-file cleanup on write — plus reload-resume now uses a stable last-user fallback so a running assistant does not spawn a duplicate block after refresh, mobile composer now surfaces full context telemetry (↑/↓/R/$ + usage + auto/manual) inline and in the controls sheet (including detailed cache/token breakdown) so advanced context data remains visible on touch devices, the inline working placeholder reports operational runtime state (tooling/permission/retry/writing) instead of mirroring thinking text, reasoning timeline summaries auto-refresh from the latest `**...**` marker in incoming thinking chunks, completed turns now force a bottom re-anchor pass to prevent post-answer upward jump, runtime context telemetry (`statusMessage`/`statusMetadata`) is persisted in session snapshots and rehydrated immediately on reload or session switch-back, model picker preferences (favorites, recents, collapsed providers) are now persisted server-side via a JSON-backed preferences store (`~/.pi/agent/pi-web-preferences.json`) exposed through `/api/preferences/models` so they survive reloads and browser changes, generic runtime placeholders like “Preparing...” are now suppressed so the inline working placeholder keeps showing live phase/tool activity labels (e.g. `Running web_search`), and image upload is now end-to-end for vision-capable models: backend exposes `/api/uploads/image` with persisted upload metadata, prompt payloads can reference uploaded images, the model capability layer now infers image input for known vision families (including `openai-codex/gpt-5.*`) when upstream metadata is incomplete, and the frontend model picker shows explicit input-type chips (TXT/IMG) while enabling attachments only when image input is supported.
