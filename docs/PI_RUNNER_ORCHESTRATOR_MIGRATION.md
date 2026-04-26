# Pi Web — One-shot migration to Pi runner/orchestrator

> Goal: replace the current in-process SDK backend model with a PizzaPi-like wrapper/orchestrator model where the web backend controls a dedicated Pi runner process, closer to using the Pi CLI/runtime.
>
> Reference studied for the architectural pattern: [Pizzaface/PizzaPi](https://github.com/Pizzaface/PizzaPi) and its docs at <https://pizzaface.github.io/PizzaPi/>. This project intentionally adopts the runner/orchestrator separation, not the full PizzaPi relay/product surface.

## 1. Target architecture

Current architecture:

```txt
Browser
  └─ REST/SSE
      └─ Express backend
          └─ @mariozechner/pi-coding-agent SDK in-process
```

Target architecture:

```txt
Browser
  └─ REST/SSE initially, WebSocket optional later
      └─ Express web/orchestrator backend
          └─ local runner protocol
              └─ Pi runner process
                  └─ Pi coding agent runtime / CLI-like API
```

The Express backend must stop owning Pi agent sessions directly. It should become an orchestrator that:

- tracks web sessions and clients;
- forwards commands to a runner;
- receives structured runner events;
- persists/replays session state for the web UI;
- exposes REST/SSE compatibility to the existing frontend during the migration.

The runner becomes the only component allowed to talk to Pi runtime APIs.

## 2. Non-negotiable design decisions

### 2.1 Replace, do not gradually wrap as final state

This migration intentionally replaces the current `SdkBridge` execution path. We may keep compatibility types and REST routes, but runtime control should move to the runner.

### 2.2 Structured protocol, no terminal scraping

We should not parse human CLI text output. The runner must emit structured JSON events and accept structured JSON commands.

Transport for first implementation:

```txt
backend spawn child process -> stdio JSONL protocol
```

Future transport can become Unix socket/WebSocket/TCP without changing frontend APIs.

### 2.3 Runner owns model registry

Like PizzaPi, model capability state should come from the live runner context:

- `availableModels` from `modelRegistry.getAvailable()`;
- current model from active Pi context/session;
- model switch via command/result events.

The web backend should not independently decide model availability.

### 2.4 Preserve frontend contract where practical

Frontend should continue using:

- REST for commands initially;
- SSE for streaming events initially.

Internally those REST commands will be converted to runner commands.

## 3. Runner protocol

### 3.1 Command envelope: backend -> runner

Each command is one JSON object per line on runner stdin.

```ts
type RunnerCommand =
  | {
      type: 'start_session';
      requestId: string;
      sessionId: string;
      cwd: string;
      model?: ModelRef;
      thinkingLevel?: ThinkingLevel;
      history?: RunnerHistoryMessage[];
    }
  | {
      type: 'send_input';
      requestId: string;
      sessionId: string;
      text: string;
      messageId?: string;
      deliverAs?: 'input' | 'steer' | 'followUp';
    }
  | {
      type: 'set_model';
      requestId: string;
      sessionId: string;
      model: ModelRef;
    }
  | {
      type: 'set_thinking_level';
      requestId: string;
      sessionId: string;
      level: ThinkingLevel;
    }
  | {
      type: 'abort';
      requestId: string;
      sessionId: string;
    }
  | {
      type: 'get_capabilities';
      requestId: string;
      sessionId?: string;
    }
  | {
      type: 'shutdown';
      requestId: string;
    };
```

### 3.2 Event envelope: runner -> backend

Each event is one JSON object per line on runner stdout.

```ts
type RunnerEvent =
  | {
      type: 'ready';
      runnerId: string;
      pid: number;
      version: string;
    }
  | {
      type: 'command_result';
      requestId: string;
      ok: boolean;
      error?: string;
      data?: unknown;
    }
  | {
      type: 'session_active';
      sessionId: string;
      cwd: string;
      model: ModelRef | null;
      thinkingLevel?: ThinkingLevel;
      availableModels: ModelInfo[];
      messages?: RunnerHistoryMessage[];
    }
  | {
      type: 'session_metadata_update';
      sessionId: string;
      model: ModelRef | null;
      thinkingLevel?: ThinkingLevel;
      availableModels: ModelInfo[];
    }
  | {
      type: 'model_set_result';
      sessionId: string;
      requestId?: string;
      ok: boolean;
      model?: ModelRef;
      error?: string;
    }
  | {
      type: 'text';
      sessionId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: 'thinking';
      sessionId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: 'tool_call';
      sessionId: string;
      messageId: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: 'tool_result';
      sessionId: string;
      messageId: string;
      toolCallId: string;
      output: unknown;
      success?: boolean;
    }
  | {
      type: 'done';
      sessionId: string;
      messageId: string;
      aborted?: boolean;
    }
  | {
      type: 'error';
      sessionId?: string;
      message?: string;
      error: string;
      fatal?: boolean;
    };
```

### 3.3 Model types

```ts
interface ModelRef {
  provider: string;
  id: string;
}

interface ModelInfo extends ModelRef {
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
}

type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
```

## 4. Backend replacement plan

### 4.1 New backend modules

Create:

```txt
backend/src/runner/
├── protocol.ts          # command/event types + zod validation
├── child-process.ts     # spawn runner, JSONL read/write, request correlation
├── orchestrator.ts      # session-level command API used by routes
├── event-adapter.ts     # runner events -> existing SSE/store events
└── state.ts             # live runner/session capability cache

backend/src/runner-process/
└── main.ts              # executable runner process entrypoint
```

### 4.2 Replace `SdkBridge`

Current routes depend on `SdkBridge`:

```ts
registerApiRoutes(app, { bridge, sessionStore, config })
```

Target routes depend on `RunnerOrchestrator`:

```ts
registerApiRoutes(app, { orchestrator, sessionStore, config })
```

Temporary compatibility:

- keep the old route paths;
- keep response shapes where frontend expects them;
- internally call orchestrator methods.

### 4.3 Orchestrator public API

```ts
interface RunnerOrchestrator {
  listModels(sessionId?: string): Promise<ModelSummary[]>;
  prompt(request: PromptRequest): Promise<PromptResult>;
  abort(sessionId: string): Promise<void>;
  setModel(sessionId: string, modelKey: string): Promise<void>;
  setThinkingLevel(sessionId: string, thinkingLevel: ThinkingLevel): Promise<void>;
  getThinkingLevels(sessionId: string): Promise<{
    currentLevel: ThinkingLevel | undefined;
    availableLevels: ThinkingLevel[];
  }>;
  dispose(): Promise<void>;
}
```

This mirrors the existing bridge API to reduce route churn, but implementation uses runner commands.

## 5. Runner process implementation

### 5.1 First runner version may still import Pi SDK

The important replacement is process/runtime ownership, not necessarily using a human terminal CLI. The runner process may import:

```ts
import {
  AgentSession,
  AuthStorage,
  ModelRegistry,
  createAgentSession,
} from '@mariozechner/pi-coding-agent';
```

But this code must live only under `backend/src/runner-process/*`, not in the web backend/orchestrator.

This matches the PizzaPi pattern more closely: the runner integrates with Pi and streams structured events to the web layer.

### 5.2 Session lifecycle

For each `start_session` / first `send_input`:

1. create or reuse runner session;
2. initialize Pi agent session with cwd/history/model;
3. refresh `ModelRegistry`;
4. emit `session_active` with `availableModels`;
5. subscribe to Pi events;
6. translate Pi events to `RunnerEvent` JSONL.

### 5.3 Model selection

On `set_model`:

1. refresh model registry;
2. find model by `{ provider, id }`;
3. if missing, emit `model_set_result { ok: false }` and command result failure;
4. call `agentSession.setModel(model)`;
5. emit `model_set_result { ok: true }`;
6. emit `session_metadata_update` / `session_active`.

Important: do not mark selected model in backend until runner confirms success.

## 6. Frontend impact

Initial target: minimal frontend breakage. We are **not** trying to match PizzaPi UX in this migration step.

Current frontend contract remains:

- REST commands for prompt/model/thinking/abort;
- SSE events for text/thinking/tool/done/error;
- existing model picker UI.

Required backend-visible behavior after this migration:

- `GET /api/models` returns runner-owned, CLI-scoped available models instead of the full authenticated registry;
- model changes are confirmed by the runner before session state is updated;
- the frontend can operate without knowing the runner exists.

Deferred UX work, not required for this milestone:

- native frontend handling of `model_set_result` as its own visible UI event;
- PizzaPi-like switching/presence/relay UX;
- WebSocket replacement for REST/SSE.

## 7. Testing strategy

### 7.1 Unit tests

Add tests for:

- JSONL protocol parser/writer;
- request correlation and timeout handling;
- runner event validation;
- event adapter mapping runner events to existing SSE events;
- model key parse/format compatibility.

### 7.2 Integration tests

Add a fake runner process fixture that emits deterministic events.

Test:

- prompt command dispatch;
- text/thinking/tool/done SSE forwarding;
- model switch success/failure;
- runner crash -> backend error event;
- restart/reconnect behavior.

### 7.3 E2E/manual smoke

- start backend;
- create session;
- send prompt;
- switch model;
- change thinking level;
- abort run;
- reload browser and verify session state.

## 8. One-shot implementation checklist

### Backend

- [x] Add `backend/src/runner/protocol.ts`.
- [x] Add `backend/src/runner/child-process.ts`.
- [x] Add live runner/session capability state. Implemented inside `backend/src/runner/orchestrator.ts` instead of a separate `state.ts` file.
- [x] Add runner event adapter. Implemented inside `backend/src/runner/orchestrator.ts` instead of a separate `event-adapter.ts` file.
- [x] Add `backend/src/runner/orchestrator.ts`.
- [x] Add `backend/src/runner-process/main.ts`.
- [x] Add build/runtime support for runner process output. Compiled builds use `dist/runner-process/main.js`; systemd/tsx source runs use `backend/src/runner-process/main.ts` with the active tsx loader.
- [x] Replace `createSdkBridge()` usage in `backend/src/server.ts` with `createRunnerOrchestrator()`.
- [x] Update API route dependencies to use `RunnerOrchestrator` while preserving the current REST route contract.
- [ ] Remove or archive old `backend/src/sdk/bridge.ts` after test parity cleanup. It is no longer used by server bootstrap, but remains as legacy code/tests.

### Models

- [x] Move live model registry ownership to runner process.
- [x] Make `GET /api/models` return runner-owned models only.
- [x] Align `GET /api/models` with CLI `/model` scope by filtering through `SettingsManager.getEnabledModels()` after cwd-bound service/extension warmup.
- [x] Confirm model changes in the runner before updating session state.
- [~] Emit `model_set_result` internally from runner to orchestrator. Public frontend-visible native `model_set_result` SSE UX is deferred because PizzaPi-like UX parity is not required now.
- [~] Update frontend model picker to use the runner-scoped REST list. Full runner-native picker UX is deferred.

### Sessions/events

- [x] Map runner `text` -> existing SSE text event.
- [x] Map runner `thinking` -> existing SSE thinking event.
- [x] Map runner `tool_call`/`tool_result` -> existing SSE tool events.
- [x] Map runner `done` -> existing done event and persistence finalization.
- [x] Map runner `error` -> existing error event.
- [x] Persist user/assistant/tool messages in the existing JSONL store from adapted runner events.
- [x] Rehydrate runner session context from stored user/assistant history.

### Tests/build

- [ ] Add dedicated unit tests for runner protocol/client/orchestrator modules.
- [ ] Add fake-runner integration tests for route/orchestrator behavior.
- [~] Frontend behavior continues to pass against the preserved REST/SSE contract; dedicated available-only model picker tests are deferred.
- [x] `npm run build --workspace=backend` green.
- [x] `npm run build --workspace=frontend` green.
- [x] `npm run test --workspace=backend` green.
- [x] `npm run test --workspace=frontend` green.
- [x] Manual REST E2E prompt through runner verified.
- [x] Manual `/api/models` verification returns CLI-scoped runner models instead of the full registry.

### Docs/status

- [x] Update `BLUEPRINT.md` section 15.0 Status Snapshot.
- [x] Update feature matrix/checklists where impacted.
- [x] Update `AGENTS.md` Current state line.

## 9. What is still missing

This migration milestone deliberately completes the backend runner/orchestrator replacement while preserving the current frontend REST/SSE UX. The following items remain before the migration can be considered fully cleaned up and production-hardened.

### 9.1 Required cleanup before declaring the migration fully complete

1. **Remove or archive legacy SDK bridge code**
   - `backend/src/sdk/bridge.ts` is no longer used by the server bootstrap.
   - Its old tests still exist and should either be migrated to runner/orchestrator coverage or moved to a legacy fixture.
   - Goal: outside `backend/src/runner-process/*`, the backend should not import or instantiate Pi `AgentSession`/`ModelRegistry` execution code.

2. **Add dedicated runner tests**
   - Unit tests for `backend/src/runner/protocol.ts` validation and serialization.
   - Unit tests for `backend/src/runner/child-process.ts` request correlation, timeout, invalid JSONL handling, stderr handling, and child exit behavior.
   - Unit tests for `backend/src/runner/orchestrator.ts` event adaptation and session-store persistence.

3. **Add fake-runner integration tests**
   - Use a deterministic fake JSONL runner process.
   - Cover prompt dispatch, text/thinking/tool/done event forwarding, model switch success/failure, thinking-level changes, abort, runner exit, and route error responses.

4. **Formalize E2E smoke script**
   - Create a repeatable script/test that starts the service or dev backend, opens SSE, sends a prompt, verifies streamed chunks, switches model, changes thinking level, aborts a run, and reloads session history.
   - Current E2E is manually verified via REST and browser smoke, not yet automated.

5. **Runner crash/restart recovery**
   - Current behavior surfaces runner errors and route failures cleanly.
   - Missing: supervised automatic respawn, session rebind/restart policy, and explicit UI-visible degraded state if the runner dies during an active turn.

### 9.2 Deliberately deferred, not required now

1. **PizzaPi-like frontend UX parity**
   - Native visible `model_set_result` UI.
   - Realtime presence/rooms/collab semantics.
   - PizzaPi-style runner management UI.
   - WebSocket relay UX.

2. **Transport replacement**
   - Current transport is local child-process stdio JSONL.
   - Unix socket/WebSocket/TCP runner transports can be added later without changing the frontend contract.

3. **Multi-runner / remote-runner support**
   - The current implementation targets one local runner process.
   - Multi-runner routing, auth, runner registration, and remote control remain future scope.

4. **Public native runner event protocol in the frontend**
   - The orchestrator currently adapts runner events back to the existing SSE event schema.
   - Exposing `session_active`, `session_metadata_update`, and `model_set_result` as first-class frontend events is deferred until needed.

### 9.3 Current migration status summary

- **Done for active runtime path:** backend orchestrator, child-process runner, JSONL protocol, prompt/model/thinking/abort routes through runner, CLI-scoped model listing, SSE adaptation, persistence, systemd/tsx spawn compatibility.
- **Still missing:** legacy bridge cleanup, dedicated runner/fake-runner tests, automated E2E script, robust runner respawn/rebind.
- **Not a goal for now:** matching PizzaPi UX.

## 10. Risks

| Risk | Impact | Mitigation |
|---|---:|---|
| Runner protocol mismatch | High | Zod validation + fake runner tests |
| Event ordering regressions | High | preserve monotonic stream and existing messageId semantics |
| Model selection stale state | Medium | runner-confirmed metadata only |
| Child process crash | High | surface error, restart cleanly, do not silently lose active run |
| Build packaging misses runner output | Medium | explicit tsconfig/build verification |
| Large migration breaks tests | High | keep REST/SSE route contract stable while replacing internals |

## 11. Acceptance criteria

The migration is complete when:

1. Express backend no longer imports/creates `AgentSession` or `ModelRegistry` outside runner-process code.
2. Prompt, abort, model selection, thinking level, session replay, and SSE streaming work through runner commands/events.
3. Model list/state is sourced from live runner capabilities and filtered to CLI `/model` scope.
4. Existing frontend can operate without knowing the runner exists.
5. Build and tests pass.
6. `BLUEPRINT.md` and `AGENTS.md` are updated.

Current status after this commit: criteria 2–6 are functionally satisfied for the active server path. Criterion 1 is satisfied for server bootstrap/runtime, but legacy `backend/src/sdk/bridge.ts` still exists and should be removed or archived in a cleanup pass.
