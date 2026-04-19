# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, update BLUEPRINT.md (status snapshot, feature matrix, phase checklists) and this file's current state line.
Current state (2026-04-19): OpenChamber-migrated UI complete - light theme with warm/beige palette (oklch-based), IBM Plex Sans/Mono fonts, English labels throughout, 304px sidebar (projects/sessions, no model filter), 56px header with session name/project label, composer with Build chip + OpenChamber-style model picker (search, favorites, full CLI-scoped registry), Tailwind CSS v4 + Radix UI primitives, Zustand stores, backend model selection reuses the shared Pi auth store (`~/.pi/agent/auth.json` + env) so CLI credentials are not duplicated, compaction hooks are disabled to avoid missing-key/totalTokens crashes, and systemd now launches Bash interactively so `OPENCODE_API_KEY` from `~/.bashrc` is visible to the backend; thinking is shown immediately on send and rendered above each assistant reply, and the optimistic row now comes from the shared chat store so it works after refresh without re-selecting the model; CLI remains the source of truth for auth/model access; all 20 frontend tests and 73 backend tests passing, build green, service active on 0.0.0.0:3210.
