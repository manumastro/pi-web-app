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
Current state (2026-04-29): Per `BLUEPRINT.md`, Pi Web is a thin web wrapper over the Pi CLI/RPC runtime; latest source updates move the bridge to Pi's official `RpcClient`, fix sidebar scroll containment, persist model picker preferences, preserve selected models through refresh, keep model selection ordered like the CLI, surface context-window usage from Pi session stats with mobile-visible working feedback, add an optional guarded restart API/UI control with strategy support (`systemd --user`, `systemd` system scope, or custom command) plus root-to-user systemd restart fallback and a mobile header action, cache model capabilities, avoid fresh SSE replay duplication, reconcile batched stream completion, simplify docs, and clean chat UX by removing sticky user messages plus centering/boxing transient working feedback.
