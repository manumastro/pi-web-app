# Pi Web — Complete System Documentation

> A browser-based interface for the **pi coding agent** — full AI coding assistant with real-time streaming, session management, multi-client support, and extensible model providers.

## 📚 Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](./ARCHITECTURE.md) | System design, data flow, tech stack, key decisions |
| [WebSocket Protocol](./WEBSOCKET_PROTOCOL.md) | Complete API reference: all client→server commands and server→client events |
| [Frontend](./FRONTEND.md) | React components, state management, rendering pipeline |
| [Backend](./BACKEND.md) | Server internals, SDK integration, session management |
| [Deployment](./DEPLOYMENT.md) | Installation, systemd, nginx, monitoring, troubleshooting |

## 🚀 Quick Start

```bash
cd pi-web-app
npm run install:all     # install dependencies
npm run build:ui        # build frontend
npm start               # start server → http://localhost:3210
```

## 📋 Feature Summary

### Core
- **In-process SDK** — runs pi SDK directly in Node.js, no subprocess overhead
- **Real-time streaming** — text, thinking, tool calls, and tool execution streamed via WebSocket
- **Multi-client** — multiple browser tabs share the same session seamlessly
- **Session management** — create, load, delete, fork, switch sessions
- **Model switching** — 88+ models across providers, searchable and grouped by provider
- **Image support** — paste or upload images, send as part of prompts

### Agent Controls
- **Steer** — send mid-execution instructions
- **Follow-up** — send follow-up messages
- **Abort** — stop the agent mid-execution
- **Compaction** — manual and automatic context compaction
- **Auto-retry** — automatic retry on transient errors

### UI
- **Dark theme** — optimized for coding sessions
- **Responsive** — collapsible sidebar on mobile
- **Thinking blocks** — collapsible chain-of-thought display
- **Tool execution display** — real-time tool I/O with expand/collapse
- **Context usage bar** — color-coded progress showing token consumption
- **Server log viewer** — real-time logs from the backend
- **Queue status** — steering and follow-up queue indicators
- **Disconnect banner** — visual indicator with auto-reconnect

## 🏗️ System Components

```
pi-web-app/
├── src/server.ts              # Backend: Express + WS + SDK bridge
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Root component, state, WS handling
│   │   ├── components/
│   │   │   ├── Chat.tsx       # Message rendering (user, assistant, system)
│   │   │   ├── Sidebar.tsx    # CWD selector + session list
│   │   │   ├── Header.tsx     # Top bar with model selector, context bar
│   │   │   └── InputArea.tsx  # Text input with image support
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts # WS hook with auto-reconnect
│   │   ├── types.ts           # Shared TypeScript types
│   │   └── utils/
│   │       └── markdown.ts    # marked + highlight.js rendering
│   └── vite.config.ts         # Build config, dev proxy
├── public/                    # Built frontend (static serve)
├── docs/                      # ← You are here
│   ├── README.md              # This file
│   ├── ARCHITECTURE.md        # System design
│   ├── WEBSOCKET_PROTOCOL.md  # API reference
│   ├── FRONTEND.md            # Frontend internals
│   ├── BACKEND.md             # Backend internals
│   └── DEPLOYMENT.md          # Ops guide
├── models.json                # Model registry fallback
├── pi-web.service             # systemd unit
├── nginx-pi-web.conf          # nginx reverse proxy config
├── package.json
└── .env.example               # environment variables template
```

## 🔑 Key Concepts

### Working Directory (CWD)
Each project directory has its own set of sessions. The CWD determines which session files are available.

### Sessions
Sessions are JSONL files stored in `~/.pi/agent/sessions/<encoded-cwd>/`. Each session contains the full conversation history with the agent.

### Per-CWD Session Pooling
The server maintains one `AgentSession` per CWD. All clients connected to the same CWD share this instance. Events are broadcast to all clients.

### URL-Driven State
The browser URL (`?cwd=/path&session=uuid`) is the source of truth for the active CWD and session. This enables bookmarkable sessions and browser navigation.

### Reconnection
When the WebSocket reconnects, the server sends the full message history and working state. If the agent was mid-stream, streaming events merge into the existing message rather than creating duplicates.

## ⚙️ Configuration

See [Deployment](./DEPLOYMENT.md) for full configuration details. Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_WEB_PORT` | `3210` | Server port |
| `PI_WEB_AUTH_TOKEN` | *(empty)* | WebSocket auth token |
| `PI_WEB_IDLE_TIMEOUT_MS` | `0` | Idle process timeout |
| `PI_WEB_CWD` | `$HOME` | Default working directory |

## 🔒 Security Model

- **WebSocket auth**: Token-based via `?token=...` query param
- **REST API**: No built-in auth (use nginx/firewall in production)
- **Static files**: Served with no-cache headers
- **File access**: SDK runs as the service user with full access to `$HOME`

## 📡 Protocol Overview

```
Client                              Server
  │                                   │
  ├──── prompt {text, cwd, images} ──→│
  │                                   ├── create/resume AgentSession
  │                                   ├── session.prompt()
  │                                   │
  │ ←── agent_start ──────────────────┤
  │ ←── thinking_start/delta/end ─────┤
  │ ←── text_start/delta/end ─────────┤
  │ ←── toolcall_start/delta/end ─────┤
  │ ←── tool_exec_start/update/end ───┤
  │ ←── done ─────────────────────────┤
  │                                   │
  ├──── load_session {cwd, id} ──────→│
  │ ←── session_loaded ───────────────┤
  │ ←── state {model, isWorking} ─────┤
  │ ←── get_messages {messages[]} ────┤
```

Full event reference: [WebSocket Protocol](./WEBSOCKET_PROTOCOL.md)
