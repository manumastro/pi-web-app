# Backend Server

## Overview

`src/server.ts` is a ~1300-line TypeScript file that serves as the backend. It runs as a single Node.js process using native TypeScript support (`--experimental-strip-types` in Node 24).

## Process Model

```
Node.js process (single thread)
├── Express HTTP server
│   ├── REST API endpoints
│   └── Static file serving (public/)
├── WebSocket server
│   ├── Per-client message handling
│   └── Ping/pong health checks (30s interval)
└── SDK sessions (one per CWD)
    └── AgentSession instances
```

There is **no clustering** and **no worker threads**. The entire application runs in a single process.

## Session Management

### CwdSession
Each working directory has at most one `CwdSession`:

```typescript
interface CwdSession {
  cwd: string;                              // working directory
  session: AgentSession;                    // SDK session instance
  clients: Set<WebSocket>;                  // connected WS clients
  unsubscribe: (() => void) | null;         // SDK event subscription
  idle: boolean;                            // no active prompt processing
  lastPromptMsg: string | null;             // last user prompt text
  lastPromptImages: any[] | null;           // attached images
  idleTimer: ReturnType<typeof setTimeout> | null;
  lastActivity: number;                     // timestamp
  settingsManager: SettingsManager;         // per-CWD settings
}
```

### Session Lifecycle

| Action | Behavior |
|--------|----------|
| `new_session` | Disposes old session, creates blank one via `SessionManager.create(cwd)` |
| `load_session` | Opens specific session file. If already active, just adds client |
| `resume_session` | Continues most recent session for the CWD |
| Client disconnect | Removes client from set. If set becomes empty, marks idle |
| Last client reconnects | Session is still in memory; client is re-added |

### Session Discovery (REST)

Sessions are discovered by **scanning JSONL files on disk**, not by querying a running process. This means:
- Sessions from crashed processes are still listed
- No state is lost on server restart
- Session metadata (name, message count, model) is extracted by parsing each line

Directory name encoding:
```
/home/manu                    → --home-manu--
/home/manu/pi-web-app         → --home-manu-pi-web-app--
/home/manu/some/deep/path     → --home-manu-some--deep--path--
```

## SDK Integration

### Session Creation
```typescript
const { session } = await createAgentSession({
  cwd,
  agentDir: AGENT_DIR,
  authStorage,
  modelRegistry,
  resourceLoader,
  settingsManager,
  sessionManager: sm,
});
```

### Event Forwarding
The server subscribes to SDK events via `session.subscribe()` and maps them to WebSocket messages:

| SDK Event | WS Message |
|-----------|-----------|
| `message_update` (thinking) | `thinking_start/delta/end` |
| `message_update` (text) | `text_start/delta/end` |
| `message_update` (toolCall) | `toolcall_start/delta/end` |
| `tool_execution_start` | `tool_exec_start` |
| `tool_execution_update` | `tool_exec_update` |
| `tool_execution_end` | `tool_exec_end` |
| `agent_start` | `agent_start` + broadcasts `isWorking: true` |
| `agent_end` | `done` + broadcasts `isWorking: false` |
| `turn_start/end` | `turn_start/end` |
| `message_start/end` | `message_start/end` |
| `compaction_start/end` | `compaction_start/end` |
| `auto_retry_start/end` | `auto_retry_start/end` |
| `queue_update` | `queue_update` |
| `error` | `error` |

### Model Resolution

Models are resolved in this order:
1. **Custom models** from `getCustomModels()` (qwen-oauth providers with zero cost, 1M context window)
2. **Registry models** from `modelRegistry.find(provider, modelId)`
3. **CLI models** from `models.json` (pre-generated fallback)

For qwen-oauth providers, the OAuth access token is read from `~/.pi/agent/auth.json` and set as a runtime API key.

### Custom Models (qwen-oauth)

The server supports multiple qwen-oauth accounts via `~/.pi/agent/qwen-oauth-profiles.json`:

```json
{
  "accounts": [
    { "provider": "qwen-oauth-account2", "label": "Account 2" }
  ]
}
```

Each account gets a `coder-model` with:
- 1M token context window
- 65K max output tokens
- Zero cost tracking
- `X-DashScope-AuthType: qwen-oauth` header

### Extensions

Extensions are loaded from two sources:
1. **Base extensions**: hardcoded paths (e.g., `pi-agent-browser`)
2. **Packages from settings.json**: `settingsData.packages` array, with `npm:` prefix resolution

Paths are resolved to absolute paths under the global node_modules:
```
npm:pi-some-package → ~/.nvm/.../node_modules/pi-some-package/index.ts
../../pi-other-package → ~/.nvm/.../node_modules/pi-other-package/index.ts
```

## REST API

### Session Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions?cwd=&limit=` | List sessions (from disk). Optional CWD filter, default limit 100 |
| `GET` | `/api/sessions/:id` | Get full message history for a session |
| `DELETE` | `/api/sessions/:id` | Delete a session file from disk |

### Info Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/cwds` | List all working directories with session counts |
| `GET` | `/api/settings` | Return `~/.pi/agent/settings.json` |
| `GET` | `/api/enabled-models` | Return `enabledModels` from settings.json |
| `GET` | `/api/logs?lines=` | Return recent systemd logs (spawns `journalctl`) |

### Static Files

All files in `public/` are served with no-cache headers:
```
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Pragma: no-cache
Expires: 0
```

## Connection Management

### Ping/Pong
Every 30 seconds, the server pings all clients. Clients that fail to pong are terminated.

### Multi-Client Broadcasting
Events are broadcast to **all** clients connected to the same CWD's `CwdSession`:
```typescript
function broadcastToClients(cr: CwdSession, msg: any) {
  const data = JSON.stringify(msg);
  for (const client of cr.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}
```

### Console Interception
`console.log` and `console.error` are overridden to broadcast to all WS clients:
```typescript
console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  broadcastLog("info", ...args);
};
```

This enables the in-app server log viewer.

### Port Retry
If the port is in use, the server retries up to 5 times with 2-second delays.

### Graceful Shutdown
On `SIGINT`/`SIGTERM`:
1. Close all SDK sessions
2. Close WebSocket server
3. Exit within 2 seconds

## Security

### WebSocket Auth
If `PI_WEB_AUTH_TOKEN` is set, every WS connection must include `?token=<token>`. Invalid tokens result in an immediate close with code 1008.

### No HTTP Auth
The REST API and static file serving have **no authentication**. In production, use a reverse proxy (nginx) or firewall rules to restrict access.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Uncaught exception | Logged, process continues (except EADDRINUSE) |
| Unhandled rejection | Logged to console (broadcast to clients) |
| Session file not found | Returns 404 JSON error |
| SDK prompt fails | Sends `error` WS message to clients |
| Model not found | Sends `rpc_error` WS message |
| Port in use | Retries 5 times, then exits |
