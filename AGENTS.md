# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, **always run `npm run build`** and restart the systemd service (`systemctl --user restart pi-web`) when the change affects the production build (CSS/UI changes, API changes, new dependencies, etc.).
After each significant change, update BOTH current-state references: `BLUEPRINT.md` (section **15.0 Status Snapshot**, plus feature matrix/checklists when impacted) and `AGENTS.md` (`Current state` line in this file), keeping the `Current state` entry short.
Current state (2026-05-03): Modular backend API is live with passing tests; fixed SDK metadata/ordering/delta streaming, smoothed SSE text output, pending assistant turn announcements, and visibly animated Working dots.
