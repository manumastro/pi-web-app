# Refactoring Plan: WebSocket → SSE + Server Split

> Replace WebSocket with Server-Sent Events (SSE) using OpenCode Web UI as reference architecture.

---

## 📋 Overview

### Current State
- **Protocol**: WebSocket (bidirectional)
- **Structure**: Single monolithic file (`server.ts` ~1500 lines)

### Target State
- **Protocol**: Server-Sent Events (SSE) — unidirectional, HTTP-based
- **Structure**: Modular architecture with separated concerns

### Reference Architecture
**OpenCode Web UI** (`anomalyco/opencode`)

```
┌──────────────────────────────────────────────────────────────┐
│                      OpenCode Architecture                     │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Client (Browser)              Local Server                     │
│  ┌──────────────┐             ┌────────────────────────────┐  │
│  │ EventSource  │◄───────────│  GET /event (SSE)         │  │
│  │              │   SSE       │                            │  │
│  └──────────────┘             │  ┌──────────────────────┐ │  │
│                                │  │   Event Bus          │ │  │
│  ┌──────────────┐             │  │   (Centralized)      │ │  │
│  │ fetch()      │────────────►│  └──────────────────────┘ │  │
│  │              │   REST      │                            │  │
│  └──────────────┘             │  ┌──────────────────────┐ │  │
│                                │  │   Session Manager    │ │  │
│                                │  └──────────────────────┘ │  │
│                                └────────────────────────────┘  │
│                                                               │
│  UI Assets: https://app.opencode.ai (remote)                  │
└──────────────────────────────────────────────────────────────┘
```

**Key differences from current pi-web-app:**
| Aspect | OpenCode | pi-web-app (current) |
|--------|----------|----------------------|
| Protocol | SSE + REST | WebSocket |
| Directionality | Unidirectional (SSE) + request/response | Bidirectional (WS) |
| Firewall | HTTP-based, firewall-friendly | WebSocket, may be blocked |
| Debug | curl works natively | Requires WS client |
| Heartbeat | SSE comment ping | WS ping/pong |

---

## 🎯 Goals

1. **Replace WebSocket completely** with SSE
2. **Use OpenCode Web UI** as the implementation reference
3. **Split monolithic server.ts** into modular structure
4. **Commit in macro implementations** (one feature per commit)

---

## 📁 Phase 1: Split server.ts

### Target Structure

```
src/
├── server.ts                    # Main entry point (~200 lines)
│                                  # - Express app setup
│                                  # - Middleware registration
│                                  # - Server startup
│
├── routes/
│   ├── sessions.ts              # Session endpoints (~200 lines)
│   │                             # - GET  /api/sessions
│   │                             # - GET  /api/sessions/:id
│   │                             # - POST /api/sessions
│   │                             # - DELETE /api/sessions/:id
│   │                             # - POST /api/sessions/:id/load
│   │                             # - POST /api/sessions/:id/fork
│   │                             # - POST /api/sessions/:id/switch
│   │
│   ├── messages.ts              # Message endpoints (~150 lines)
│   │                             # - POST /api/sessions/:id/prompt
│   │                             # - POST /api/sessions/:id/steer
│   │                             # - POST /api/sessions/:id/follow_up
│   │                             # - POST /api/sessions/:id/abort
│   │
│   ├── models.ts                # Model endpoints (~100 lines)
│   │                             # - GET  /api/models
│   │                             # - POST /api/sessions/:id/model
│   │                             # - POST /api/sessions/:id/cycle_model
│   │
│   ├── state.ts                 # State endpoints (~100 lines)
│   │                             # - GET  /api/sessions/:id/state
│   │                             # - GET  /api/sessions/:id/stats
│   │
│   └── events.ts                # SSE endpoint (~150 lines)
│                                  # - GET  /api/events (SSE stream)
│                                  # - Connection management
│                                  # - Heartbeat
│
├── services/
│   ├── sessionManager.ts        # CwdSession management (~200 lines)
│   │                             # - cwdSessions Map
│   │                             # - createSdkSession()
│   │                             # - getOrCreateSession()
│   │                             # - disposeSession()
│   │
│   ├── eventForwarder.ts        # Event → SSE forwarding (~200 lines)
│   │                             # - forwardEvent()
│   │                             # - broadcastToClients()
│   │                             # - SSE connection registry
│   │
│   └── errorCategorizer.ts      # Error categorization (~60 lines)
│                                  # - categorizeError()
│
├── middleware/
│   ├── auth.ts                  # Authentication (~50 lines)
│   │                             # - wsAuth / httpAuth
│   │                             # - token validation
│   │
│   └── cors.ts                  # CORS handling (~30 lines)
│                                  # - cors middleware
│
└── types/
    └── index.ts                 # Shared TypeScript types
```

### Commit Strategy (Phase 1)

| Commit | Description | Files |
|--------|-------------|-------|
| `refactor: extract types to separate module` | Move types to `src/types/` | `src/types/index.ts` |
| `refactor: extract error categorizer service` | Move `categorizeError()` | `src/services/errorCategorizer.ts` |
| `refactor: extract session manager service` | Move `CwdSession`, `cwdSessions`, `createSdkSession()` | `src/services/sessionManager.ts` |
| `refactor: extract event forwarder service` | Move `forwardEvent()`, `broadcastToClients()` | `src/services/eventForwarder.ts` |
| `refactor: extract auth middleware` | Move auth logic | `src/middleware/auth.ts` |
| `refactor: extract session routes` | Move session REST endpoints | `src/routes/sessions.ts` |
| `refactor: extract message routes` | Move prompt/steer/abort endpoints | `src/routes/messages.ts` |
| `refactor: extract model routes` | Move model endpoints | `src/routes/models.ts` |
| `refactor: extract state routes` | Move state/stats endpoints | `src/routes/state.ts` |
| `refactor: slim server.ts to entry point` | Keep only app setup + route registration | `src/server.ts` |

---

## 📁 Phase 2: Replace WebSocket with SSE

### OpenCode SSE Pattern

```typescript
// Server (Express)
app.get('/api/events', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial connection event
  res.write(`event: server.connected\ndata: {}\n\n`);

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // Register for events
  const unsubscribe = session.subscribe((event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
```

```typescript
// Client (Browser)
const eventSource = new EventSource('/api/events');

eventSource.addEventListener('server.connected', (e) => {
  console.log('Connected to SSE');
});

eventSource.addEventListener('message', (e) => {
  const event = JSON.parse(e.data);
  handleEvent(event);
});

eventSource.addEventListener('error', (e) => {
  // Auto-reconnect by default
  console.error('SSE error');
});
```

### Endpoint Mapping

| Current (WebSocket) | Target (SSE/REST) |
|---------------------|-------------------|
| WS `prompt` | POST `/api/sessions/:id/prompt` |
| WS `steer` | POST `/api/sessions/:id/steer` |
| WS `follow_up` | POST `/api/sessions/:id/follow_up` |
| WS `abort` | POST `/api/sessions/:id/abort` |
| WS `new_session` | POST `/api/sessions` |
| WS `load_session` | POST `/api/sessions/:id/load` |
| WS `switch_session` | POST `/api/sessions/:id/switch` |
| WS `fork` | POST `/api/sessions/:id/fork` |
| WS `set_model` | POST `/api/sessions/:id/model` |
| WS `get_state` | GET `/api/sessions/:id/state` |
| WS `get_session_stats` | GET `/api/sessions/:id/stats` |
| WS events (streaming) | SSE `/api/events` |

### SSE Event Types

Following OpenCode's event system:

```typescript
// Connection events
{ type: "server.connected", properties: { sessionId: string } }
{ type: "server.error", properties: { message: string } }

// Session events
{ type: "session.created", properties: { sessionId: string } }
{ type: "session.loaded", properties: { sessionId: string } }
{ type: "session.switched", properties: { sessionId: string } }
{ type: "session.forked", properties: { sessionId: string } }

// Status events
{ type: "session.status", properties: { status: "idle" | "active" | "error" } }

// Message events
{ type: "message.start", properties: { message: Message } }
{ type: "message.update", properties: { message: Message } }
{ type: "message.end", properties: { message: Message } }

// Part events (streaming)
{ type: "part.created", properties: { part: Part } }
{ type: "part.updated", properties: { part: Part, delta?: string } }

// Tool events
{ type: "tool.started", properties: { tool: string, args: any } }
{ type: "tool.updated", properties: { tool: string, output: string } }
{ type: "tool.completed", properties: { tool: string, result: any } }
{ type: "tool.failed", properties: { tool: string, error: string } }

// Error events
{ type: "error", properties: { message: string, code?: string } }
{ type: "retry.started", properties: { attempt: number, delay: number, reason: string } }
{ type: "retry.completed", properties: { success: boolean } }
```

### Commit Strategy (Phase 2)

| Commit | Description | Files |
|--------|-------------|-------|
| `feat: add SSE endpoint with basic event stream` | Basic SSE setup with heartbeat | `src/routes/events.ts`, `frontend/src/hooks/useSSE.ts` |
| `feat: replace WS with SSE event connection` | Frontend uses EventSource instead of WebSocket | `frontend/src/hooks/useSSE.ts`, `frontend/src/App.tsx` |
| `feat: convert prompt to REST POST` | POST `/api/sessions/:id/prompt` | `src/routes/messages.ts` |
| `feat: convert steer/follow_up/abort to REST` | REST endpoints for all commands | `src/routes/messages.ts` |
| `feat: convert session management to REST` | Full REST API for sessions | `src/routes/sessions.ts` |
| `feat: remove WebSocket server` | Remove WS server code | `src/server.ts` |
| `test: verify SSE events match WS events` | Ensure parity | - |

---

## 📁 Phase 3: Cleanup & Documentation

### Commits

| Commit | Description |
|--------|-------------|
| `docs: update WEBSOCKET_PROTOCOL.md to SSE` | Rename to `SSE_PROTOCOL.md`, update content |
| `docs: add SSE migration notes` | Document changes from WS to SSE |
| `chore: remove unused WS types` | Clean up frontend WS types |
| `refactor: final architecture review` | Ensure clean separation |

---

## 🚀 Execution Order

```
Phase 1: Split server.ts (10 commits)
    │
    ├─ Commit 1-2: Types + Error Categorizer
    ├─ Commit 3-4: Services (sessionManager, eventForwarder)
    ├─ Commit 5: Middleware
    ├─ Commit 6-9: Routes (sessions, messages, models, state)
    └─ Commit 10: Slim server.ts

Phase 2: Replace WS with SSE (7 commits)
    │
    ├─ Commit 11: Basic SSE endpoint
    ├─ Commit 12: Frontend SSE hook
    ├─ Commit 13-14: REST conversion
    ├─ Commit 15-16: Remove WS
    └─ Commit 17: Verification

Phase 3: Cleanup (4 commits)
    │
    └─ Commits 18-21: Documentation + cleanup
```

---

## ⚠️ Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing clients | High | Keep old WS working until SSE verified |
| SSE reconnection handling | Medium | Implement proper EventSource reconnection |
| Browser compatibility | Low | EventSource supported in all modern browsers |
| Performance regression | Low | Test before/after benchmarks |

---

## ✅ Verification Checklist

- [ ] All existing features work with SSE
- [ ] Reconnection properly restores session state
- [ ] Events stream without packet loss
- [ ] Heartbeat keeps connection alive
- [ ] REST endpoints return correct status codes
- [ ] Error responses are informative
- [ ] Frontend reconnects automatically on disconnect
- [ ] No memory leaks from SSE connections
