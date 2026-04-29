# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, update BOTH current-state references: `BLUEPRINT.md` (section **15.0 Status Snapshot**, plus feature matrix/checklists when impacted) and `AGENTS.md` (`Current state` line in this file), keeping the `Current state` entry strictly on a single line consistent with the BLUEPRINT snapshot.
Current state (2026-04-29): Per `BLUEPRINT.md` (15.0/5.1/15.1–15.6), project status is tracked there as source of truth; latest work hardens model-list 503 resiliency, fixes relay-status API routing before SPA catch-all, removes recovered-gap error flashes, adds done/idle reconciliation retries for intermittent truncated assistant rendering, introduces forensic client-event logging (`/api/forensics/*` + `.forensics/client-events.ndjson`), adds SSE listener coverage for `status`, enforces numeric event-id ordering in frontend SSE coalescing to prevent out-of-order chunk concatenation artifacts, and hardens assistant turn binding (strict messageId matching + placeholder reuse/guarded premature done handling) with fullstack stream/screenshot E2E coverage (`scripts/e2e-fullstack-stream.mjs`, `scripts/e2e-continuous-screenshots.mjs`).
