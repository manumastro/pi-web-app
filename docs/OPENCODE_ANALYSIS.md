# OpenCode Web UI — Architecture Analysis

> Analisi comparativa dell'architettura di OpenCode Web UI e pi-web-app.
> Fonti: [GitHub Issue #11616](https://github.com/anomalyco/opencode/issues/11616)

---

## 📊 Panoramica Architetturale

### OpenCode Web UI

```
┌─────────────────────────────────────────────────────────────────┐
│                      OpenCode Web UI                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐         ┌──────────────────────────────┐ │
│  │   Web Client     │         │   Local Hono Server          │ │
│  │   (Browser)      │◄───────►│   (opencode web)             │ │
│  │                  │  SSE +   │   Port: 4096 (default)      │ │
│  │                  │  REST    │                              │ │
│  └──────────────────┘         │  ┌────────────────────────┐  │ │
│                               │  │   Event Bus System     │  │ │
│                               │  │   (Centralized)        │  │ │
│                               │  └────────────────────────┘  │ │
│                               │                              │ │
│                               │  ┌────────────────────────┐  │ │
│                               │  │   Session Manager      │  │ │
│                               │  │   (Per-instance)      │  │ │
│                               │  └────────────────────────┘  │ │
│                               └──────────────────────────────┘ │
│                                                                  │
│  UI Assets: https://app.opencode.ai (remote)                     │
└─────────────────────────────────────────────────────────────────┘
```

### pi-web-app

```
┌─────────────────────────────────────────────────────────────────┐
│                      pi-web-app                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐         ┌──────────────────────────────┐ │
│  │   React SPA      │◄───────►│   Node.js Server             │ │
│  │   (Browser)      │  WS     │   (Express + WS)             │ │
│  │                  │         │   Port: 3210                 │ │
│  └──────────────────┘         │                              │ │
│                               │  ┌────────────────────────┐  │ │
│                               │  │   CwdSession Map       │  │ │
│                               │  │   (Per-CWD)           │  │ │
│                               │  └────────────────────────┘  │ │
│                               │                              │ │
│                               │  ┌────────────────────────┐  │ │
│                               │  │   pi SDK              │  │ │
│                               │  │   (In-process)        │  │ │
│                               │  └────────────────────────┘  │ │
│                               └──────────────────────────────┘ │
│                                                                  │
│  UI Assets: /public (local)                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Protocollo di Comunicazione

### OpenCode: SSE + REST

| Operazione | Metodo | Endpoint |
|------------|--------|----------|
| Ricevere eventi | SSE | `GET /event` |
| Inviare messaggio | POST | `POST /session/:id/message` |
| Leggere messaggi | GET | `GET /session/:id/message` |
| Stato sessione | GET | `GET /session/status` |

### pi-web-app: WebSocket Bidirezionale

| Operazione | Metodo |
|------------|--------|
| Tutto (comandi + eventi) | WebSocket |

### Confronto

| Aspetto | OpenCode | pi-web-app |
|---------|----------|------------|
| **Protocollo** | SSE + REST | WebSocket |
| **Direzionalità** | Unidirezionale (SSE) + request/response | Bidirezionale |
| **Complessità** | Più endpoint, più protocolli | Un solo protocollo |
| **HTTP caching** | Possibile per REST | Non applicabile |
| **Firewall** | SSE potrebbe essere bloccato | WebSocket più permissivo |
| **Reconnect** | Client gestisce reconnect SSE | Built-in con `useWebSocket` hook |

---

## 🔔 Sistema di Eventi

### OpenCode: Event Bus Centralizzato

```typescript
// Definizione evento
BusEvent.define("session.status", zodSchema)

// Event types principali
type Event =
  | { type: "message.updated", properties: { info: Message } }
  | { type: "message.part.updated", properties: { part: Part, delta?: string } }
  | { type: "session.status", properties: { sessionID: string, status: Status } }
  | { type: "question.asked", properties: { requestID: string, questions: Question[] } }
  | { type: "permission.asked", properties: { requestID: string, ... } }
  | { type: "todo.updated", properties: { sessionID: string, todos: Todo[] } }
```

### pi-web-app: Eventi WS Mappati

```typescript
// Mappatura eventi SDK → WS
case "message_update" (thinking) → "thinking_start/delta/end"
case "agent_start" → "agent_start"
case "agent_end" → "done"
case "tool_execution_start" → "tool_exec_start"
// ... etc
```

### Confronto

| Aspetto | OpenCode | pi-web-app |
|---------|----------|------------|
| **Typing** | Zod schemas, full type safety | TypeScript types |
| **Extensibility** | `BusEvent.define()` ovunque | Hardcoded nel server |
| **Event count** | 20+ tipi eventi | ~15 tipi eventi |
| **Custom events** | Facile (define ovunque) | Richiede modifica server |

---

## 📊 Session Status

### OpenCode

```typescript
type Status = 
  | { type: "idle" }
  | { type: "active" }
  | { type: "error", error: string }
  | { type: "retry", attempt: number, message: string, next: number }

// Esempio retry:
{
  type: "retry",
  attempt: 2,
  message: "Rate Limited",
  next: 1738435200000
}
```

### pi-web-app

```typescript
type SessionStatus = 'idle' | 'working' | 'streaming'

// In state event:
{ isWorking: boolean, workingDuration: number | null }
```

### Confronto

| Aspetto | OpenCode | pi-web-app |
|---------|----------|------------|
| **Stati** | idle, active, error, retry | idle, working, streaming |
| **Retry info** | ✅ attempt, message, next timestamp | ❌ Non supportato |
| **Error details** | ✅ type + message | ⚠️ Solo message |
| **Streaming state** | ❌ Non esplicito | ✅ "streaming" separato |

---

## 🔁 Reconnection Handling

### OpenCode

```typescript
// Client connette a SSE
const eventSource = new EventSource('/event');

// Server invia immediatamente
eventSource.onmessage = (event) => {
  const { type, properties } = JSON.parse(event.data);
  
  if (type === 'server.connected') {
    // Client connesso, sync stato
  }
  
  // Heartbeat ogni 30 secondi
  if (type === 'heartbeat') {
    // Keep-alive
  }
};
```

**Flusso:**
1. SSE reconnect automatico del browser
2. `server.connected` evento al reconnect
3. Client richiede stato via REST: `GET /session/status`
4. UI aggiornata

### pi-web-app

```typescript
// useWebSocket hook
const connect = useCallback(() => {
  ws.onclose = () => {
    setConnected(false);
    // Auto-reconnect dopo 3 secondi
    reconnectTimer.current = setTimeout(connect, 3000);
  };
});

// onConnected callback
onConnected: () => {
  send({ type: 'get_available_models', cwd: selectedCwd });
  send({ type: 'load_session', cwd: selectedCwd, sessionId: activeSessionId });
}
```

**Flusso:**
1. WebSocket close detectato
2. Auto-reconnect dopo 3s
3. `load_session` inviato
4. Server risponde con `state` + `get_messages`

### Confronto

| Aspetto | OpenCode | pi-web-app |
|---------|----------|------------|
| **Heartbeat** | 30 secondi (server → client) | Ping/pong ogni 30s |
| **Reconnect delay** | Browser SSE default | 3 secondi custom |
| **State sync** | REST polling dopo reconnect | `load_session` immediato |
| **Preservation** | Server mantiene stato sessione | `idle` preservato su disconnect |

---

## 🔒 Retry & Error Handling

### OpenCode: Retry Intelligence

```typescript
// Exponential backoff
RETRY_INITIAL_DELAY = 2000ms
RETRY_BACKOFF_FACTOR = 2
// Schedule: 2s → 4s → 8s → 16s → 30s (capped)

// Error detection patterns
- "too_many_requests" (Anthropic)
- "rate_limit_exceeded" (OpenAI)
- "exceeded your current quota" (Gemini)
- "Overloaded" (generic)
```

**UI feedback:**
```typescript
// "Rate Limited [retrying in 8s attempt #2]"
```

### pi-web-app

```typescript
// Backend supporta auto-retry (dal SDK)
case "auto_retry_start/end": // Eventi esistono

// Frontend non ha UI dedicata per retry
// Solo error generico mostrato
```

### Confronto

| Aspetto | OpenCode | pi-web-app |
|---------|----------|------------|
| **Retry logic** | ✅ Completa con backoff | ⚠️ SDK-level only |
| **Error patterns** | ✅ Provider-specific detection | ❌ Non implementato |
| **UI feedback** | ✅ Countdown timer | ❌ Non implementato |
| **Retry events** | ✅ `session.status.retry` | ⚠️ Solo `auto_retry_start/end` |

---

## 🏗️ Struttura Server

### OpenCode

```
packages/opencode/src/
├── cli/cmd/web.ts           # Entry point
├── server/
│   ├── server.ts            # Hono setup, SSE endpoint
│   └── routes/
│       ├── session.ts       # Session & message endpoints
│       ├── question.ts      # Question handling
│       └── permission.ts    # Permission handling
├── bus/
│   └── bus-event.ts         # Event bus system
└── session/
    ├── message-v2.ts        # Message types
    ├── status.ts            # Status management
    └── retry.ts             # Retry logic
```

### pi-web-app

```
src/
├── server.ts                # Express + WS + SDK integration
├── frontend/src/
│   ├── App.tsx              # React root + event handling
│   ├── hooks/
│   │   └── useWebSocket.ts  # WS hook
│   └── stores/
│       └── sessionStatusStore.ts  # Zustand store
```

### Confronto

| Aspetto | OpenCode | pi-web-app |
|---------|----------|------------|
| **Framework** | Hono | Express |
| **Modularità** | Route-based separation | Single file (circa 1500 linee) |
| **Extensions** | BusEvent ovunque | Extension loading da settings.json |
| **Multi-session** | Multiple instances | Per-CWD sessions |

---

## 📱 Feature Aggiuntive OpenCode

### 1. Question System
```typescript
// Quando AI richiede input utente
{ type: "question.asked", properties: { requestID, questions } }

// Client risponde
POST /question/:requestID/reply { answers: [...] }
```

### 2. Permission System
```typescript
// Quando AI richiede permesso (es. exec bash)
{ type: "permission.asked", properties: { requestID, ... } }

// Client approva/nega
POST /permission/:requestID/reply
```

### 3. Todo System
```typescript
{ type: "todo.updated", properties: { sessionID, todos } }
GET /session/:id/todo
```

---

## 🎯 Raccomandazioni per pi-web-app

### ✅ Alta Priorità — IMPLEMENTATI

1. **Retry UI**: ✅ IMPLEMENTATO
   - Nuovo componente `RetryBanner` in `frontend/src/components/RetryBanner.tsx`
   - Countdown timer dal `delayMs` con aggiornamento ogni 100ms
   - Mostra tentativo corrente / massimo tentativi
   - Messaggio errore con truncation

2. **Error Type Detection**: ✅ IMPLEMENTATO
   - Backend: `categorizeError()` in `server.ts` rileva 7 categorie
   - Server invia `errorCategory` e `isRetryable` al client
   - Frontend: categorizzazione lato client come fallback
   - Categorie: rate_limit, quota, overload, timeout, network, auth, api

### Media Priorità

3. **Question/Permission Handling**: Se supportato dal SDK
   - `question.asked` → modal input
   - `permission.asked` → approve/deny UI

4. **Split server.ts**: Raccogliere route handlers in file separati
   - `routes/sessions.ts`
   - `routes/models.ts`
   - `routes/state.ts`

### Bassa Priorità

5. **Event Bus Pattern**: Rendere eventi estensibili
   - permettere extension di definire eventi custom

6. **SSE Alternative**: Considerare SSE come alternativa a WebSocket
   - più REST-friendly
   - HTTP caching possibile

---

## 📝 Note Finali

L'architettura di OpenCode è più matura e distribuita, con:
- Event bus centralizzato per extensibility
- Retry intelligence con UI dedicata
- Separate handling per question/permission/todo

pi-web-app ha un approccio più semplice ma efficace:
- WebSocket bidirezionale
- Session state tracking per reconnect
- In-process SDK integration

La scelta tra SSE+REST vs WebSocket dipende dal caso d'uso:
- **OpenCode**: multi-client, mobile-first, extensibility
- **pi-web-app**: semplicità, real-time singolo client

---

## 🔗 Riferimenti

- [OpenCode Issue #11616](https://github.com/anomalyco/opencode/issues/11616) — Documentazione ufficiale architettura
- [OpenCode Issue #13947](https://github.com/anomalyco/opencode/issues/13947) — Bug reconnect (risolto)
- [OpenCode Retry Logic](packages/opencode/src/session/retry.ts)
- [OpenCode Session Status](packages/opencode/src/session/status.ts)
