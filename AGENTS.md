# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, update BLUEPRINT.md (status snapshot, feature matrix, phase checklists) and this file's current state line.
Current state (2026-04-18): OpenChamber-migrated UI with Tailwind CSS v4 + Radix UI primitives, Flexoki dark palette, Zustand stores integrated in App.tsx (chatStore, sessionStore, uiStore), 250px sidebar (projects/sessions/models), 56px header with status chip, send-only composer (Enter), SSE reconnect backoff, question/permission inline cards, compaction disabled (avoids totalTokens error), model selection persisted to session, model picker now mirrors CLI `/models` availability (available-only), build green, 18 frontend tests passing, service active on 0.0.0.0:3210.
