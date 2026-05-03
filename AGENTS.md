# Pi Web — Project Guide
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
Frontend: React + Vite with URL-driven state and reusable components/hooks.
Add or update tests for every meaningful change; keep builds green.
Use npm workspaces; verify with build/test before handoff.
After each significant change, **always build the frontend** and restart the systemd service (`systemctl --user restart pi-web`) when the change affects the production build (CSS/UI changes, API changes, new dependencies, etc.).

**Frontend build**: use `cd frontend && npx vite build --logLevel silent` (~1m25s) instead of `npm run build` (~2m35s) — navigating the npm workspace root adds ~45% overhead. The result lands in `dist/public/` the same way.
After each significant change, update BOTH current-state references: `BLUEPRINT.md` (section **15.0 Status Snapshot**, plus feature matrix/checklists when impacted) and `AGENTS.md` (`Current state` line in this file), keeping the `Current state` entry short.
Current state (2026-05-03): Service runs via interactive bash (`bash -ic`) with global Pi CLI resolution, web model picker mirrors CLI enabled-model visibility, and all `useVirtualizer()` calls pass `useFlushSync: false` to avoid React #185 nested-update render loops caused by `flushSync` in `useLayoutEffect` cascading into zustand v5 `useSyncExternalStore` subscriptions (React 19 issue #31730).
