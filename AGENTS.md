# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, update BOTH current-state references: `BLUEPRINT.md` (section **15.0 Status Snapshot**, plus feature matrix/checklists when impacted) and `AGENTS.md` (`Current state` line in this file).
Current state (2026-04-26): See `BLUEPRINT.md` (sections **15.0 Status Snapshot**, **5.1 Feature Matrix**, and phase checklists **15.1–15.6**) as the single up-to-date source of project status; latest significant change fixes the runner prompt 500 on sessions with persisted assistant history by rehydrating assistant messages with valid zeroed usage/cost metadata; direct prompt returns 202 and backend runner/relay E2E plus backend tests are green. UX parity work currently includes the reliability increment, `Cmd/Ctrl+K` command palette, and enhanced tool cards; frontend lint/tests are green with 79 tests.
