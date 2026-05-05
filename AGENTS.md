# Pi Web — Project Guide (backend-only branch)
Use BLUEPRINT.md as the source of truth for scope, architecture, and phase priorities.
Keep changes modular, type-safe, config-driven, and within file-size budgets.
Prefer explicit dependency injection; avoid globals, magic refs, and dead code.
Backend: Express + TypeScript + SSE/REST with sessions, models, api, and sse layers.
**Frontend has been removed** from this branch. UI will be re-implemented from ~/openchamber.
Add or update tests for every meaningful change; keep builds green.
After each significant change, restart the systemd service (`systemctl --user restart pi-web`).

**Testing**:
- Unit/API tests: `npm run test --workspace=backend` (vitest, 119 tests)
- E2E backend API test: `node scripts/e2e-backend-api.mjs` (requires running backend)
- API smoke test: `bash test-api-simple.sh` (curl-based, against running backend)

Current state (2026-05-05): Branch `backend-only-no-frontend` created. Frontend directory removed. Root package.json cleaned to backend-only workspace. E2E backend API test (`scripts/e2e-backend-api.mjs`) fully functional: 16/16 assertions pass, covering health, config, models, session CRUD, prompt streaming via SSE, multi-turn chat, session listing, and message persistence. All 119 unit tests pass. Ready for OpenChamber UI re-implementation.
