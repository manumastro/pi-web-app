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
        │  WebSocket │             │
        └────────────┼─────────────┘
                     │
┌────────────────────┼──────────────────────┐
│         Express Server (SDK bridge)        │
│  ┌─────────────────┼────────────────────┐ │
│  │  WS Handler     │  REST API          │ │
│  │  Multi-client   │  GET /sessions     │ │
│  │  Auth token     │  GET /sessions/:id │ │
│  │  Idle mgmt      │  GET /cwds         │ │
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
- Shared state across all connected WebSocket clients for the same CWD

### URL as Source of Truth
The browser URL (`?cwd=/path&session=uuid`) is the single source of truth for the active working directory and session. All navigation updates the URL via `setSearchParams({ replace: true })`. This enables:
- Bookmarkable sessions
- Browser back/forward navigation
- Tab-sharing of specific sessions

### Per-CWD Session Pooling
The server maintains **one `CwdSession` per working directory**. All WebSocket clients working on the same CWD share the same `AgentSession` instance. This means:
- Multiple tabs see the same conversation
- Events from the agent are broadcast to all clients
- When the last client disconnects, the session is marked idle

### Message Cache
The frontend caches parsed messages in a module-level `Map` with a 5-minute TTL. This avoids redundant REST API fetches when switching between sessions rapidly.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js 24 (TypeScript via `--experimental-strip-types`) |
| Backend framework | Express 4 + WebSocket (`ws`) |
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
    → ws.send({ type: "prompt", text, images, cwd })
      → server.ts WS handler
        → getOrCreateSession(cwd)
        → cr.session.prompt(text, { images?, streamingBehavior? })
          → SDK processes, emits events
            → forwardEvent() maps SDK events → WS messages
              → broadcastToClients() → all connected tabs
                → App.handleEvent() → setMessages()
                  → MessageList re-renders
```

### Reconnection Flow
```
Network drop → ws.onclose → useWebSocket reconnect timer (3s)
  → ws.onopen → onConnected()
    1. Refresh session list (REST)
    2. Send get_state (WS)
    3. Send get_available_models (WS)
    4. Send load_session (WS) ← last, so client is registered
      → server finds session file, adds client
      → after 100ms: broadcast state + get_messages
        → client receives full message history + isWorking
          → if agent was mid-stream, streaming events resume
            → handlers merge into existing assistant message
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
