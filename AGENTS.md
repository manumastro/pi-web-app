# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, update BLUEPRINT.md (status snapshot, feature matrix, phase checklists) and this file's current state line.
Current state (2026-04-18): OpenChamber-style UI with Flexoki dark palette (#151313/#da702c/#cecdc3), IBM Plex fonts, 280px sidebar (projects/sessions/models), 48px header with status chip, send-only composer (Enter), SSE reconnect backoff, question/permission inline cards, build green (71 backend + 16 frontend tests), service active on 0.0.0.0:3210.
