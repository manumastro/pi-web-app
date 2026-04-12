# WebSocket Protocol

All WebSocket messages are JSON-encoded strings. The base URL is `ws://host:port` with an optional `?token=...` query parameter for authentication.

## Authentication

If `PI_WEB_AUTH_TOKEN` is set on the server, every WebSocket connection must include the token:
```
ws://host:3210?token=your-secret
```
Without a valid token, the server sends an `error` message and closes the connection.

---

## Client → Server Commands

### Chat

#### `prompt`
Send a user message to the agent. Creates or resumes a session for the CWD.

```json
{
  "type": "prompt",
  "text": "Write a function to sort an array",
  "cwd": "/home/manu/project",
  "images": ["data:image/png;base64,..."]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `text` | Yes | The user's message |
| `cwd` | No | Working directory (default: `$HOME`) |
| `images` | No | Array of base64 data URIs |

If the agent is already working, the prompt is queued with `streamingBehavior: "steer"`.

#### `steer`
Send a steering instruction while the agent is working.

```json
{
  "type": "steer",
  "text": "Actually use TypeScript instead of JavaScript",
  "cwd": "/home/manu/project"
}
```

#### `follow_up`
Send a follow-up message.

```json
{
  "type": "follow_up",
  "text": "Also add tests for edge cases",
  "cwd": "/home/manu/project"
}
```

#### `abort`
Stop the agent mid-execution.

```json
{ "type": "abort" }
```

### Session Management

#### `new_session` / `create_session`
Dispose the current session and create a fresh one.

```json
{
  "type": "new_session",
  "cwd": "/home/manu/project"
}
```

#### `load_session`
Load a specific session by ID.

```json
{
  "type": "load_session",
  "cwd": "/home/manu/project",
  "sessionId": "5a456370-9073-4ae6-a843-0caa2c597554"
}
```

After loading, the server automatically broadcasts:
1. `session_loaded` event
2. `state` event (model, isWorking, etc.)
3. `rpc_response` with `command: "get_messages"` (full message history)

#### `resume_session`
Resume the most recent session for a CWD.

```json
{
  "type": "resume_session",
  "cwd": "/home/manu/project"
}
```

#### `switch_session`
Switch to a session by its file path.

```json
{
  "type": "switch_session",
  "sessionPath": "/home/manu/.pi/agent/sessions/--home-manu-project--/2026-04-12T10-00-00Z_abc.jsonl"
}
```

#### `fork`
Create a branched session from a specific entry point.

```json
{
  "type": "fork",
  "entryId": "msg_123"
}
```

### Model & Settings

#### `set_model`
Set the active model. Persists to `settings.json` as the default.

```json
{
  "type": "set_model",
  "provider": "qwen-oauth",
  "modelId": "coder-model",
  "cwd": "/home/manu/project"
}
```

If no session exists for the CWD, one is created automatically.

#### `cycle_model`
Cycle to the next available model.

```json
{ "type": "cycle_model", "cwd": "/home/manu/project" }
```

#### `set_thinking_level`
Set the thinking/reasoning level.

```json
{
  "type": "set_thinking_level",
  "level": "high"
}
```

#### `cycle_thinking_level`
Cycle through thinking levels.

```json
{ "type": "cycle_thinking_level" }
```

#### `get_available_models`
Request the list of available models.

```json
{ "type": "get_available_models", "cwd": "/home/manu/project" }
```

Response via `rpc_response` with `command: "get_models"`.

### State & Diagnostics

#### `get_state`
Get current session state (model, thinking level, isWorking, etc.).

```json
{ "type": "get_state", "cwd": "/home/manu/project" }
```

Response via `state` event.

#### `get_messages`
Get all messages from the current session's in-memory buffer.

```json
{ "type": "get_messages", "cwd": "/home/manu/project" }
```

Response via `rpc_response` with `command: "get_messages"` including `messages` array and `isWorking` boolean.

#### `get_session_stats`
Get token usage and context information.

```json
{ "type": "get_session_stats", "cwd": "/home/manu/project" }
```

Response via `rpc_response` with `command: "get_session_stats"`.

### Compaction & Retry

#### `compact`
Manually trigger context compaction.

```json
{
  "type": "compact",
  "customInstructions": "Summarize the code changes so far"
}
```

#### `set_auto_compaction`
Toggle automatic context compaction.

```json
{ "type": "set_auto_compaction", "enabled": true }
```

#### `set_auto_retry`
Toggle automatic retry on transient errors.

```json
{ "type": "set_auto_retry", "enabled": true }
```

#### `set_steering_mode`
Set the steering mode behavior.

```json
{ "type": "set_steering_mode", "mode": "inline" }
```

#### `set_follow_up_mode`
Set the follow-up mode behavior.

```json
{ "type": "set_follow_up_mode", "mode": "inline" }
```

### Other

#### `bash`
Execute a bash command (sent as `!<command>` prompt).

```json
{
  "type": "bash",
  "command": "ls -la",
  "cwd": "/home/manu/project"
}
```

---

## Server → Client Events

### State

#### `state`
Session state snapshot. Sent in response to `get_state` and after session load.

```json
{
  "type": "state",
  "model": "coder-model",
  "provider": "qwen-oauth",
  "thinkingLevel": "high",
  "messages": 42,
  "sessionId": "5a456370-...",
  "sessionFile": "/path/to/session.jsonl",
  "isWorking": true,
  "cwd": "/home/manu/project"
}
```

#### `model_info`
Model changed notification.

```json
{ "type": "model_info", "model": "qwen-oauth/coder-model" }
```

### Streaming Events

These events are emitted during the agent's response generation. They are used by the frontend to incrementally build the assistant's message.

#### Thinking
```json
{ "type": "thinking_start" }
{ "type": "thinking_delta", "text": "I need to consider..." }
{ "type": "thinking_end" }
```

#### Text
```json
{ "type": "text_start" }
{ "type": "text_delta", "text": "Here's the solution:" }
{ "type": "text_end" }
```

#### Tool Calls (from the model's response)
```json
{ "type": "toolcall_start", "tool": "Write" }
{ "type": "toolcall_delta", "text": "{\"path\":\"..." }
{ "type": "toolcall_end", "tool": "Write" }
```

### Tool Execution Events

These events are emitted when the SDK actually executes a tool.

```json
{
  "type": "tool_exec_start",
  "tool": "Bash",
  "args": {"command": "npm test"},
  "toolCallId": "call_abc123"
}
{
  "type": "tool_exec_update",
  "tool": "Bash",
  "text": "Running tests...\n",
  "toolCallId": "call_abc123"
}
{
  "type": "tool_exec_end",
  "tool": "Bash",
  "isError": false,
  "result": { "content": [{"type": "text", "text": "All 42 tests passed"}] },
  "toolCallId": "call_abc123"
}
```

The `toolCallId` field allows matching execution events to their corresponding tool call in the message.

### Agent Lifecycle

#### `agent_start`
The agent has started processing a prompt. Sets `isWorking: true`.

```json
{ "type": "agent_start" }
```

#### `agent_end` / `done`
The agent has finished. Sets `isWorking: false`.

```json
{ "type": "done", "messages": [...] }
```

#### `turn_start` / `turn_end`
A turn (single LLM call within a multi-turn agentic loop) starts/ends.

```json
{ "type": "turn_start" }
{ "type": "turn_end", "message": {...}, "toolResults": [...] }
```

#### `message_start` / `message_end`
A message (user or assistant) starts/ends in the session.

```json
{ "type": "message_start", "message": {...} }
{ "type": "message_end", "message": {...} }
```

### Compaction

#### `compaction_start`
```json
{ "type": "compaction_start", "reason": "context_full" }
```

#### `compaction_end`
```json
{
  "type": "compaction_end",
  "reason": "context_full",
  "aborted": false,
  "willRetry": false,
  "summary": "User asked for array sorting...",
  "firstKeptEntryId": "msg_456"
}
```

### Auto-Retry

#### `auto_retry_start`
```json
{
  "type": "auto_retry_start",
  "attempt": 1,
  "maxAttempts": 3,
  "delayMs": 2000,
  "errorMessage": "Rate limit exceeded"
}
```

#### `auto_retry_end`
```json
{
  "type": "auto_retry_end",
  "success": true,
  "attempt": 1
}
```
or
```json
{
  "type": "auto_retry_end",
  "success": false,
  "attempt": 3,
  "finalError": "Rate limit exceeded after 3 retries"
}
```

### Queue

#### `queue_update`
Steering and follow-up queue status.

```json
{
  "type": "queue_update",
  "steering": [...],
  "followUp": [...]
}
```

### RPC Responses

#### `rpc_response`
Generic response to client commands.

```json
{
  "type": "rpc_response",
  "command": "get_available_models",
  "data": { "models": [...] }
}
```

Common commands:
- `get_available_models` → `{ models: ModelInfo[] }`
- `get_session_stats` → `{ sessionId, messages, model, tokensBefore, contextUsage, contextWindow }`
- `get_messages` → `{ messages: [...], isWorking: boolean, sessionId }`

#### `rpc_error`
An RPC command failed.

```json
{
  "type": "rpc_error",
  "command": "set_model",
  "error": "Model not found: unknown/model"
}
```

#### `rpc_info`
Informational message from an RPC command.

```json
{
  "type": "rpc_info",
  "message": "Stop command sent"
}
```

### Errors

#### `error`
A general error occurred.

```json
{ "type": "error", "message": "Failed to create session: ..." }
```

#### `extension_error`
An extension threw an error.

```json
{
  "type": "extension_error",
  "extensionPath": "/path/to/extension.ts",
  "event": "tool_execution",
  "error": "Permission denied"
}
```

### Logging

#### `server_log`
A console.log or console.error from the server, broadcast to all clients.

```json
{
  "type": "server_log",
  "level": "info",
  "message": "📖 Loaded session 5a456370 for /home/manu/project"
}
```

### Session Events

#### `session_created`
A new session was created.

```json
{
  "type": "session_created",
  "sessionId": "5a456370-...",
  "sessionFile": "/path/to/session.jsonl"
}
```

#### `session_loaded`
An existing session was loaded.

```json
{
  "type": "session_loaded",
  "sessionId": "5a456370-...",
  "sessionFile": "/path/to/session.jsonl"
}
```

#### `session_switched`
Session was switched.

```json
{
  "type": "session_switched",
  "sessionId": "new-session-id"
}
```

#### `session_forked`
Session was forked.

```json
{
  "type": "session_forked",
  "sessionId": "branched-session-id"
}
```
