# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite + Zustand with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test/lint before handoff.
Current state: SDK bridge integrated, persistent sessions/SSE replay, modular React UI, question/permission interactions, build/tests green.
