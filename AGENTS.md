# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, update BOTH current-state references: `BLUEPRINT.md` (section **15.0 Status Snapshot**, plus feature matrix/checklists when impacted) and `AGENTS.md` (`Current state` line in this file).
Current state (2026-04-27): See `BLUEPRINT.md` (sections **15.0 Status Snapshot**, **5.1 Feature Matrix**, and phase checklists **15.1–15.6**) as the single up-to-date source of project status; latest significant change repairs wrapper fidelity issues reported in field use: automatic session titles now get a first-stored-user/current-prompt fallback while still accepting Pi RPC `session_name` supersession, header/sidebar session names resync live from SSE, dark-theme contrast avoids invalid OKLCH-as-HSL and dark-on-dark Pi Web control text, model selection remains session-scoped from live `pi --mode rpc` capabilities filtered/ordered by CLI `~/.pi/agent/settings.json.enabledModels` plus hidden-model env, and remaining external reference names were removed from source code. CLI-wrapper architecture (`pi --mode rpc`, no backend runner or SDK imports) remains intact; frontend/backend lint/tests/build are green (80 frontend tests, 99 backend tests).
