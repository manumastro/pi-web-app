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

- `GET /api/config`
- `GET /api/directories`
- `GET /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions`, `PUT /api/sessions/:id`, `DELETE /api/sessions/:id`
- `POST /api/messages/prompt`, `POST /api/messages/abort`
- `GET /api/models?sessionId=...`
- `PUT /api/models/session/model`
- `GET/PUT /api/models/session/thinking`

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

## 6. Known history / why code looks this way

Earlier versions used a custom multi-layer CLI wrapper and broad OpenChamber UI migration. That left some duplicated CSS and conservative compatibility code. The current direction is to simplify around Pi's official RPC client while preserving the existing REST/SSE web contract.

## 7. Current priorities

1. Keep build/test green.
2. Avoid custom Pi protocol handling; prefer official `RpcClient` or SDK APIs.
3. Keep sidebar/model/stream UX deterministic under large session counts and reconnects.
4. Continue reducing duplicate CSS and stale migration artifacts.
5. Add E2E coverage for long sidebars, model favorites persistence and stream reconnect/reconcile.

## 8. Status Snapshot

2026-04-29: Audit/fix pass completed in source: official Pi `RpcClient` bridge, sidebar scroll containment, model preferences persistence, selected-model preservation, CLI-ordered model lists, backend model capability caching, context-window usage metadata from Pi session stats (now mobile-visible in working feedback), optional guarded restart API/UI control with strategy support (`systemd --user`, `systemd` system scope, or custom command) including root-to-user systemd restart fallback for agent environments and a mobile header action, SSE no-replay fresh hydration, batched done reconcile, runner error persistence, simplified blueprint, and chat UX cleanup removing sticky user messages plus centering/boxing transient working feedback.
