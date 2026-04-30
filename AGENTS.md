# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, **always run `npm run build`** and restart the systemd service (`systemctl --user restart pi-web`) when the change affects the production build (CSS/UI changes, API changes, new dependencies, etc.).
After each significant change, update BOTH current-state references: `BLUEPRINT.md` (section **15.0 Status Snapshot**, plus feature matrix/checklists when impacted) and `AGENTS.md` (`Current state` line in this file), keeping the `Current state` entry strictly on a single line consistent with the BLUEPRINT snapshot.
Current state (2026-04-30): Per `BLUEPRINT.md`, Pi Web remains a thin web wrapper over the Pi CLI/RPC runtime; latest source updates keep the official `RpcClient` bridge, document and expose guarded restart controls (API/UI) with strategy support (`systemd --user`, `systemd` system scope, custom command, plus root→user fallback), include mobile restart action, and preserve context-window usage metadata across status updates.
