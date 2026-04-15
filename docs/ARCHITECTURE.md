# Architecture

## Overview

Pi Web is a **full-stack AI coding agent interface** built on `@mariozechner/pi-coding-agent`. It provides a browser-based UI for interacting with the pi coding agent, with full session management, real-time streaming, and multi-client support.

```
┌──────────────────────────────────────────┐
│              Browser (React 19)           │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ │
│  │ Sidebar  │ │  Chat    │ │  Input    │ │
│  │ Sessions │ │ Messages │ │  Images   │ │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ │
└───────┼────────────┼─────────────┼────────┘
        │  SSE + REST API           │
        └────────────┼─────────────┘
                     │
┌────────────────────┼──────────────────────┐
│         Express Server (SDK bridge)        │
│  ┌─────────────────┼────────────────────┐ │
│  │  SSE Handler    │  REST API          │ │
│  │  /events       │  GET/POST /sessions │ │
│  │  CWD binding   │  GET /cwds          │ │
│  │  Heartbeat    │  POST /prompt       │ │
│  └────────┬────────┴────────────────────┘ │
│           │  createAgentSession()         │
│  ┌────────┴────────────────────────────┐  │
│  │  @mariozechner/pi-coding-agent SDK  │  │
│  │  (same code as CLI, in-process)     │  │
│  │                                     │  │
│  │  Auth:  ~/.pi/agent/auth.json       │  │
│  │  Model: ~/.pi/agent/settings.json   │  │
│  │  Extensions: pi-qwen-oauth, etc.    │  │
│  │  Skills, Context files              │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

## Key Design Decisions

### In-Process SDK (No Subprocess)
The server runs the pi SDK **directly in the same Node.js process**. There is no subprocess spawning of the `pi` CLI. This means:
- Zero overhead from process creation
- Direct access to `AgentSession` APIs (`prompt`, `steer`, `abort`, `setModel`, etc.)
- Real-time event subscription via `session.subscribe()`
- Shared state across all connected clients for the same CWD

### SSE + REST Architecture
Pi Web uses **Server-Sent Events (SSE)** for server-to-client streaming and **REST API** for client-to-server commands:
- **SSE**: Real-time event stream (think/thinking, text delta, tool calls, etc.)
- **REST**: Send prompts, steer, abort, load sessions, etc.

This follows the OpenCode Web UI pattern for simplicity and reliability.

### URL as Source of Truth
The browser URL (`?cwd=/path&session=uuid`) is the single source of truth for the active working directory and session. All navigation updates the URL via `setSearchParams({ replace: true })`. This enables:
- Bookmarkable sessions
- Browser back/forward navigation
- Tab-sharing of specific sessions

### Per-CWD Session Pooling
The server maintains **one `CwdSession` per working directory**. All SSE clients working on the same CWD receive the same events. This means:
- Multiple tabs see the same conversation
- Events from the agent are broadcast to all clients via SSE
- When the last client disconnects, the session is marked idle

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend runtime | Node.js 24 (via tsx) |
| Backend framework | Express 4 |
| Protocol | SSE (Server-Sent Events) + REST API |
| SDK | `@mariozechner/pi-coding-agent` v0.66 |
| Frontend framework | React 19 |
| Frontend build | Vite 6 |
| Styling | Tailwind CSS 4 |
| Routing | react-router-dom 7 (used only for `useSearchParams`) |
| Markdown | `marked` 15 + `highlight.js` 11 |
| Process manager | systemd |

## Data Flow

### Sending a Prompt
```
User types message → InputArea.onSend()
  → App.handleSend()
    → send({ type: "prompt", text, images, cwd })
      → REST POST /api/sessions/prompt
        → server.ts route handler
        → getOrCreateSession(cwd)
        → cr.session.prompt(text, { images?, streamingBehavior? })
          → SDK processes, emits events
            → forwardEvent() maps SDK events → SSE
              → broadcastToSSE() → all connected SSE clients
                → useSSE.onEvent() → setMessages()
                  → MessageList re-renders
```

### Reconnection Flow
```
Network drop → EventSource onerror → useSSE reconnect timer (3s)
  → EventSource onopen → onConnected()
    1. Refresh session list (REST)
    2. Poll get_state (REST)
    3. Send load_session (REST) ← last, so session is registered
      → SSE events resume streaming
```

## Session File Format

Sessions are stored as **JSONL files** in `~/.pi/agent/sessions/<encoded-cwd>/`:

```
2026-04-12T13-41-01-080Z_5a456370.jsonl
```

Each line is a JSON object:
```jsonl
{"type":"session","cwd":"/home/manu/pi-web-app","timestamp":...}
{"type":"message","message":{"role":"user","content":"Hello"}}
{"type":"message","message":{"role":"assistant","content":[...]}}
{"type":"model_change","modelId":"coder-model","provider":"qwen-oauth"}
```

Directory names are encoded: `/home/manu/pi-web-app` → `--home-manu-pi-web-app--`.

## API Reference

### SSE Endpoint
```
GET /api/events?cwd=/path/to/project
```
Streams events for the specified CWD.

### REST Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cwds` | List all project directories |
| `GET` | `/api/sessions` | List sessions for a CWD |
| `GET` | `/api/sessions/:id` | Get session messages |
| `POST` | `/api/sessions` | Create new session |
| `POST` | `/api/sessions/load` | Load existing session |
| `POST` | `/api/sessions/prompt` | Send prompt |
| `POST` | `/api/sessions/steer` | Steer agent |
| `POST` | `/api/sessions/follow_up` | Follow-up message |
| `POST` | `/api/sessions/abort` | Abort operation |
| `DELETE` | `/api/sessions/:id` | Delete session |
