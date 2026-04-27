# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, update BOTH current-state references: `BLUEPRINT.md` (section **15.0 Status Snapshot**, plus feature matrix/checklists when impacted) and `AGENTS.md` (`Current state` line in this file).
Current state (2026-04-27): See `BLUEPRINT.md` (sections **15.0 Status Snapshot**, **5.1 Feature Matrix**, and phase checklists **15.1–15.6**) as the single up-to-date source of project status; latest significant change continues PizzaPi parity by adding live relay viewer status in header/sidebar from `/api/relay/status`, end-to-end multi-client SSE gap recovery (event-id gap detect → session snapshot reload), richer Pi CLI error fidelity in frontend (raw provider/usage-limit messages preserved and surfaced), explicit inline rendering of SSE error records plus a sticky in-chat error banner, gating sidebar chase animation to active working sessions only, live agent-driven session naming via `session_name` SSE updates, and session-scoped model selection that is empty without a session and honors the CLI/PizzaPi hidden-model env contract when present. CLI-wrapper architecture (`pi --mode rpc`, no backend runner or SDK imports) remains intact; frontend/backend lint/tests/build are green (80 frontend tests, 96 backend tests).
