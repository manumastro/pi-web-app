# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, update BOTH current-state references: `BLUEPRINT.md` (section **15.0 Status Snapshot**, plus feature matrix/checklists when impacted) and `AGENTS.md` (`Current state` line in this file).
Current state (2026-04-25): See `BLUEPRINT.md` (sections **15.0 Status Snapshot**, **5.1 Feature Matrix**, and phase checklists **15.1–15.6**) as the single up-to-date source of project status; latest significant change starts the one-shot PizzaPi-like runner/orchestrator migration by adding the structured JSONL runner protocol, child-process runner client, dedicated Pi runner process, backend orchestrator adapter, server bootstrap swap away from direct in-process SDK ownership, a systemd/tsx-compatible runner spawn fix, and CLI-scoped runner model listing via `SettingsManager.getEnabledModels()` after cwd-bound service/extension warmup.
