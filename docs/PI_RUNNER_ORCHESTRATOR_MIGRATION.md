# Pi Web — One-shot migration to Pi runner/orchestrator

> Goal: replace the current in-process runner backend model with a PizzaPi-like wrapper/orchestrator model where the web backend controls a dedicated Pi runner process, closer to using the Pi CLI/runtime.
>
> Reference studied for the architectural pattern: [Pizzaface/PizzaPi](https://github.com/Pizzaface/PizzaPi) and its docs at <https://pizzaface.github.io/PizzaPi/>. This project intentionally adopts the runner/orchestrator separation, not the full PizzaPi relay/product surface.

## 1. Target architecture

Current architecture:

```txt
Browser
  └─ REST/SSE
      └─ Express backend
          └─ Pi CLI runner in-process
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

This mirrors the existing runner API to reduce route churn, but implementation uses runner commands.

## 5. Runner process implementation

### 5.1 First runner version may still import Pi runner

The important replacement is process/runtime ownership, not necessarily using a human terminal CLI. The runner process may import:

```ts
import {
  AgentSession,
  AuthStorage,
  ModelRegistry,
  createAgentSession,
} from 'Pi CLI';
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
- [x] Remove old runner implementation files after replacing coverage with runner/orchestrator tests.

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

- [x] Add dedicated unit tests for runner protocol/client/orchestrator modules.
- [x] Add fake-runner integration tests for route/orchestrator behavior.
- [~] Frontend behavior continues to pass against the preserved REST/SSE contract; dedicated available-only model picker tests are deferred.
- [x] `npm run build --workspace=backend` green.
- [x] `npm run build --workspace=frontend` green.
- [x] `npm run test --workspace=backend` green.
- [x] `npm run test --workspace=frontend` green.
- [x] Manual REST E2E prompt through runner verified.
- [x] Manual `/api/models` verification returns CLI-scoped runner models instead of the full registry.
- [x] Add repeatable runner smoke E2E script: `npm run test:e2e:runner --workspace=backend`.
- [x] Add same-server WebSocket relay smoke E2E script: `npm run test:e2e:relay --workspace=backend`.

### Docs/status

- [x] Update `BLUEPRINT.md` section 15.0 Status Snapshot.
- [x] Update feature matrix/checklists where impacted.
- [x] Update `AGENTS.md` Current state line.

## 9. Same-server PizzaPi-like technical completion

This migration now completes the local/same-server technical equivalent of the PizzaPi architecture: the web server contains the relay/orchestrator, controls a dedicated local runner process, and exposes both the preserved REST/SSE compatibility API and a WebSocket relay endpoint for realtime viewer-style transport.

### 9.1 Completed cleanup/hardening

1. **Legacy runner cleanup complete**
   - Removed the old runner implementation and its tests.
   - `grep` verification shows no `AgentSession`/`ModelRegistry`/`createAgentSession` imports outside `backend/src/runner-process/*`.

2. **Dedicated runner tests added**
   - `backend/src/runner/protocol.test.ts` covers validation, serialization, and event parsing errors.
   - `backend/src/runner/child-process.test.ts` covers request correlation, invalid JSONL, stderr forwarding, child exit rejection, and request timeout.
   - `backend/src/runner/orchestrator.test.ts` uses a deterministic fake JSONL runner for prompt dispatch, event adaptation, persistence, model switch success/failure, thinking-level change, and abort.
   - `backend/src/api/runner-routes.test.ts` verifies route-level JSON error responses for runner failures.

3. **Repeatable E2E smoke script added and verified**
   - `backend/scripts/e2e-runner-smoke.mjs`.
   - NPM entrypoint: `npm run test:e2e:runner --workspace=backend`.
   - Covers health, model listing, session creation, SSE streaming, prompt completion, model switch, thinking-level switch, abort, and persisted assistant message verification.

4. **Runner crash/error handling hardened**
   - Active-turn runner exits now emit SSE error events, mark affected sessions as `error`, clear active turn state, and remain recoverable.
   - Future commands respawn the child runner via `RunnerProcessClient.start()`.

5. **Same-server relay layer added**
   - `backend/src/relay/protocol.ts` defines viewer WebSocket commands/events.
   - `backend/src/relay/server.ts` installs `/api/relay` on the same HTTP server; no external relay service is required.
   - Relay supports viewer hello/presence, subscribe/unsubscribe, ping/pong, list models, prompt, abort, model switching, thinking-level switching, and forwarding adapted SSE events as `sse_event` messages.
   - `/api/relay/status` exposes local relay state.
   - `src/server.ts` now boots `createHttpServer()` so systemd/source mode includes WebSocket upgrade handling.

6. **Relay tests and E2E added**
   - `backend/src/relay/protocol.test.ts` covers viewer protocol validation/serialization.
   - `backend/src/relay/server.test.ts` covers WebSocket connection, subscription, presence/session counts, command dispatch, invalid command errors, and forwarding session events.
   - `backend/scripts/e2e-relay-smoke.mjs` verifies `/api/relay` against the running service.

### 9.2 Deliberately retained compatibility surface

The following pieces are intentionally kept because they are still useful compatibility APIs, not incomplete migration leftovers:

1. **REST command routes**
   - Existing frontend and scripts continue to use REST for prompt/model/thinking/abort.
   - Internally these routes still go through the runner orchestrator.

2. **SSE event route**
   - Existing frontend streaming keeps working over `/api/events`.
   - The new WebSocket relay observes the same canonical SSE event stream and forwards it to subscribed relay viewers.

3. **Local child-process runner transport**
   - Because the requirement is that everything lives in the same server deployment, runner transport remains local stdio JSONL instead of remote runner registration/auth.
   - This preserves PizzaPi's separation of concerns without adding an unnecessary separate deployable runner service.

### 9.3 Out of scope by product decision, not technical blockers

- Matching PizzaPi's exact frontend UX/chrome.
- Remote runner registration/auth across machines.
- Multi-machine relay topology.

### 9.4 Current migration status summary

- **Done:** same-server relay/orchestrator, child-process runner, JSONL runner protocol, WebSocket viewer relay protocol, prompt/model/thinking/abort through runner, CLI-scoped model listing, SSE + WebSocket event forwarding, persistence, systemd/tsx spawn compatibility, legacy bridge removal, runner/fake-runner/relay/route tests, automated runner and relay smoke E2E, and recoverable runner-exit handling.
- **No known migration cleanup leftovers:** obsolete runner implementation has been removed; REST/SSE remain intentionally as compatibility APIs.

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

Current status: all acceptance criteria are satisfied for the same-server PizzaPi-like technical milestone. The exact PizzaPi UX and remote multi-machine deployment model are intentionally out of scope because this app keeps relay, orchestrator, and local runner supervision in one server deployment.
