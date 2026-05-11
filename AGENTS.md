# Pi Web — Project Guide (OpenChamber UI import phase)

Use `BLUEPRINT.md` as the single source of truth.

## Current fixed baseline (DO NOT regress)

- Backend wrapper around Pi CLI/RPC is **tested and stable (100%)** for project scope.
- Backend test status to preserve:
  - `npm run test --workspace=backend` → **119/119 pass**
  - `node scripts/e2e-backend-api.mjs` → **16/16 pass**
- Backend must remain green while frontend migration continues.

## Current project phase

We are importing the OpenChamber UI **step by step** into `frontend/`, adapting it to this backend.

Priority order:
1. Chat core UI parity (layout/interaction/streaming)
2. Runtime wiring parity required by chat
3. Progressive cleanup of adapters/temporary bridges
4. Frontend tests for every stabilized imported area

## Rules for all changes

- Keep backend behavior/API contracts stable.
- Prefer original OpenChamber files when importing UI.
- Avoid custom rewrites if a direct upstream file can be used.
- Remove temporary adapters once original component works.
- Add/update tests for meaningful frontend changes.
- Keep build green.
- After significant changes: `systemctl --user restart pi-web`.

## Validation checklist

- Frontend build: `npm run build:frontend`
- Backend unit/API tests: `npm run test --workspace=backend`
- Backend E2E API: `node scripts/e2e-backend-api.mjs`
- Service health: `curl http://localhost:3211/health`

## Runtime notes

- Active branch: `backend-only-no-frontend`
- Production service serves `dist/public` on port `3211`
- Default model target: `opencode-go/deepseek-v4-flash`
