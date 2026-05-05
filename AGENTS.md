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

Current state (2026-05-05): Branch `backend-only-no-frontend` created. Frontend directory removed, then re-created as minimal chat UI.
- **Frontend**: Vite + React + Tailwind, minimal chat with SSE streaming
- **E2E backend API test** (`scripts/e2e-backend-api.mjs`): 16/16 assertions pass
- **All 119 unit tests pass**, types compile cleanly
- **Chat E2E working**: frontend ↔ backend via REST + SSE, streaming responses
- Default model: `opencode-go/deepseek-v4-flash`
- Ready for incremental UI improvements from ~/openchamber
