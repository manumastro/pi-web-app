# Pi Web Blueprint (Reset Baseline — 2026-05-06)

## 1) Product direction (current starting point)

Pi Web is a **web wrapper** around the Pi CLI/RPC backend.

Current fixed point:
- Backend is functioning and tested.
- Frontend is in migration: we are importing OpenChamber UI incrementally, starting from chat.

This document replaces previous migration history and is now the operative baseline.

---

## 2) Non-negotiable backend baseline

Backend must remain stable while frontend evolves.

Required green checks:
- `npm run test --workspace=backend` → 119/119
- `node scripts/e2e-backend-api.mjs` → 16/16

Interpretation:
- Backend API + SSE contracts are considered stable for current scope.
- Frontend work must adapt to backend, not destabilize backend.

---

## 3) Architecture baseline

### Backend (stable)
- Express + TypeScript
- REST + SSE contracts
- Session/model/prompt orchestration via Pi wrapper
- Systemd-served production process

### Frontend (migration in progress)
- Vite + React
- OpenChamber UI components being imported step-by-step
- Temporary bridges allowed only as short-lived transition aids

---

## 4) Current migration objective

Primary objective now:

> Achieve OpenChamber chat UI parity using original components/files as much as possible, then add robust frontend tests.

Scope priority:
1. Chat core components (container/list/message/input/markdown)
2. Required runtime providers/stores/hooks used by chat
3. Removal of adapters and duplicated/bridge naming
4. Cleanup of unused code after parity stabilization

---

## 5) Implementation rules

1. Prefer **raw upstream OpenChamber files** over rewrites.
2. Keep naming consistent with upstream (no extra `.openchamber`/`adapter` suffixes once stable).
3. If a temporary compatibility layer is needed, isolate it and remove it quickly.
4. Keep backend API/SSE contracts untouched unless absolutely required.
5. Every meaningful frontend import/adaptation must include tests (or updated tests).

---

## 6) Testing strategy (from now on)

### Backend (must always stay green)
- `npm run test --workspace=backend`
- `node scripts/e2e-backend-api.mjs`

### Frontend (to expand during migration)
- Build gate: `npm run build:frontend`
- Add/expand component and integration tests for imported chat behavior:
  - render parity (empty/loading/chat states)
  - submit flow
  - SSE stream rendering
  - error boundary/runtime-provider wiring

Definition of done for each migration step:
- build passes
- backend tests unchanged/green
- frontend behavior verified by tests and manual smoke check

---

## 7) Operational runbook

- Restart service after significant changes:
  - `systemctl --user restart pi-web`
- Health check:
  - `curl http://localhost:3211/health`
- Production serves frontend from `dist/public` on port `3211`.

---

## 8) Immediate next milestones

1. Lock chat core on original OpenChamber components.
2. Ensure runtime wiring is complete (providers/stores/sync) for chat interactions.
3. Remove residual adapters/bridges and normalize filenames.
4. Introduce/expand frontend tests for chat parity.
5. Perform pruning only after tests confirm no regressions.

---

## 9) Success criteria

Project is considered aligned when:
- backend remains 100% stable on existing test suite,
- chat UI/behavior is OpenChamber-parity for core flows,
- frontend migration proceeds with tests guarding each imported step.
