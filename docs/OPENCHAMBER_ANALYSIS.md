# OpenChamber Web UI — Architecture Analysis

> Analisi comparativa dell'architettura di OpenChamber Web UI e pi-web-app.
> Basato su: [OpenChamber GitHub](https://github.com/openchamber/openchamber)

---

## 📊 Panoramica Architetturale

### OpenChamber Web UI

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenChamber Web UI                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐         ┌──────────────────────────────┐ │
│  │   React SPA      │◄───────►│   Express Server            │ │
│  │   (Browser)       │  SSE    │   (Node.js)                │ │
│  │                   │         │   Port: 3000 (default)      │ │
│  │  SyncContext      │         │                            │ │
│  │  ├─ EventPipeline│         │  ┌────────────────────────┐  │ │
│  │  ├─ SessionStores│         │  │  OpenCode SDK Client  │  │ │
│  │  └─ ChildStores  │         │  │  (SSE + REST)         │  │ │
│  └──────────────────┘         │  └────────────────────────┘  │ │
│                               │                              │ │
│                               │  ┌────────────────────────┐  │ │
│                               │  │  Session Management     │  │ │
│                               │  │  (Per-directory)        │  │ │
│                               │  └────────────────────────┘  │ │
│                               └──────────────────────────────┘ │
│                                                                  │
│  UI Assets: Bundled via Vite (local)                             │
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

### Confronto Quick

| Aspetto | OpenChamber | pi-web-app |
|---------|-------------|------------|
| **Frontend** | React 19 | React 18 |
| **Server** | Express (JS) | Express + WS | 
| **Protocollo** | SSE + REST (OpenCode SDK) | WebSocket |
| **State** | Zustand (multiple stores) | Zustand (single + context) |
| **Sincronizzazione** | Per-directory child stores | Per-CWD |

---

## 🔄 Protocollo di Comunicazione

### OpenChamber: SSE + REST (via OpenCode SDK)

OpenChamber utilizza l'SDK OpenCode (`@opencode-ai/sdk/v2/client`) che espone:

| Operazione | Metodo SDK |
|------------|------------|
| Ricevere eventi | `sdk.global.event()` → SSE stream |
| Inviare messaggio | `sdk.session.message()` |
| Leggere messaggi | `sdk.session.messages()` |
| Creare sessione | `sdk.session.create()` |
| Shell command | `sdk.session.shell()` |
| Commands | `sdk.session.command()` |

### pi-web-app: WebSocket Bidirezionale

| Operazione | Metodo |
|------------|--------|
| Tutto (comandi + eventi) | WebSocket |

### Confronto

| Aspetto | OpenChamber | pi-web-app |
|---------|-------------|------------|
| **Protocollo** | SSE + REST (OpenCode SDK) | WebSocket |
| **Direzionalità** | Unidirezionale (SSE) + request/response | Bidirezionale |
| **SDK** | Ufficiale OpenCode SDK | Custom integration |
| **Typing** | Full TypeScript types from SDK | TypeScript types |
| **API coverage** | 30+ endpoint via SDK | ~15 event types |

---

## 🔔 Sistema di Eventi

### OpenChamber: Event Pipeline

```typescript
// packages/ui/src/sync/event-pipeline.ts
export type QueuedEvent = {
  directory: string
  payload: Event  // From @opencode-ai/sdk/v2/client
}

// Event coalescing
const key = (payload: Event): string | undefined => {
  if (payload.type === "session.status") 
    return `session.status:${props.sessionID}`
  if (payload.type === "message.part.updated") 
    return `message.part.updated:${part.messageID}:${part.id}`
  if (payload.type === "message.part.delta") 
    return `message.part.delta:${messageID}:${partID}:${field}`
}

// Stale delta tracking for part recovery
```

### pi-web-app: Eventi WS Mappati

```typescript
// Mappatura eventi SDK → WS
case "message_update" (thinking) → "thinking_start/delta/end"
case "agent_start" → "agent_start"
case "agent_end" → "done"
// ... etc
```

### Confronto

| Aspetto | OpenChamber | pi-web-app |
|---------|-------------|------------|
| **Typing** | OpenCode SDK (zod schemas) | TypeScript types |
| **Event coalescing** | ✅ Implementato (per-directory) | ❌ Non implementato |
| **Stale delta tracking** | ✅ Implementato | ❌ Non implementato |
| **Parts gap recovery** | ✅ Implementato | ❌ Non implementato |
| **Custom events** | Via SDK event types | Hardcoded nel server |

---

## 📊 Session Status

### OpenChamber

```typescript
// Usa lo stesso schema di OpenCode
type SessionStatus = 
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry", attempt: number, message: string, next: number }

// Global status tracking per sidebar
interface GlobalSessionStatusStore {
  statuses: Record<string, SessionStatus>
}
```

### pi-web-app

```typescript
type SessionStatus = 'idle' | 'working' | 'streaming'

// In state event:
{ isWorking: boolean, workingDuration: number | null }
```

### Confronto

| Aspetto | OpenChamber | pi-web-app |
|---------|-------------|------------|
| **Stati** | idle, busy, retry | idle, working, streaming |
| **Global status** | ✅ Sì (sidebar) | ❌ Non implementato |
| **Retry info** | ✅ attempt, message, next | ❌ Non supportato |
| **Multi-session view** | ✅ | ❌ |

---

## 🔁 Reconnection Handling

### OpenChamber

```typescript
// event-pipeline.ts
const HEARTBEAT_TIMEOUT_MS = 15_000
const RECONNECT_DELAY_MS = 250
const FLUSH_FRAME_MS = 16
const STREAM_YIELD_MS = 8

// Heartbeat check
const resetHeartbeat = () => {
  lastEventAt = Date.now()
  if (heartbeat) clearTimeout(heartbeat)
  heartbeat = setTimeout(() => {
    attempt?.abort()  // Trigger reconnect
  }, HEARTBEAT_TIMEOUT_MS)
}

// SSE loop with auto-reconnect
void (async () => {
  while (!abort.signal.aborted) {
    // ... connect and stream
    for await (const event of events.stream) {
      // Enqueue with coalescing
    }
    // Auto-reconnect on error/abort
    await wait(RECONNECT_DELAY_MS)
  }
})()
```

**Flusso:**
1. SSE stream continua fino a heartbeat timeout
2. `attempt?.abort()` triggera reconnect
3. `RECONNECT_DELAY_MS` (250ms) pausa prima di riconnettersi
4. Eventi processati con coalescing per evitare duplicati

### pi-web-app

```typescript
// useWebSocket hook
const connect = useCallback(() => {
  ws.onclose = () => {
    setConnected(false);
    reconnectTimer.current = setTimeout(connect, 3000);
  };
});
```

### Confronto

| Aspetto | OpenChamber | pi-web-app |
|---------|-------------|------------|
| **Heartbeat timeout** | 15 secondi | 30 secondi (ping/pong) |
| **Reconnect delay** | 250ms | 3 secondi |
| **Coalescing** | ✅ Per-directory | ❌ Non implementato |
| **Stale delta recovery** | ✅ | ❌ |

---

## 🏗️ Struttura Server

### OpenChamber

```
packages/web/
├── server/
│   ├── index.js              # Express server (~1500 linee)
│   ├── lib/
│   │   ├── opencode/         # OpenCode integration
│   │   ├── tunnels/          # Tunnel management
│   │   ├── notifications/    # Push notifications
│   │   └── ...
│   └── bin/                  # CLI entry
└── src/
    ├── api/                 # REST API handlers
    └── main.tsx             # Web worker entry

packages/ui/src/
├── sync/
│   ├── sync-context.tsx     # Main sync provider
│   ├── event-pipeline.ts    # SSE connection + coalescing
│   ├── event-reducer.ts     # Event → store mutations
│   ├── session-ui-store.ts  # UI state
│   ├── global-sync-store.ts # Global state
│   └── child-store.ts       # Per-directory stores
└── components/             # React components
```

### pi-web-app

```
src/
├── server.ts                # Express + WS + SDK integration (~1500 linee)
├── frontend/src/
│   ├── App.tsx              # React root + event handling
│   ├── hooks/
│   │   └── useWebSocket.ts  # WS hook
│   └── stores/
│       └── sessionStatusStore.ts  # Zustand store
```

### Confronto

| Aspetto | OpenChamber | pi-web-app |
|---------|-------------|------------|
| **Framework server** | Express | Express |
| **Modularità** | Route-based + runtime factories | Single file |
| **Frontend** | React 19 + Zustand | React 18 + Zustand |
| **Stores** | Multiple (per-feature) | Single main store |
| **Multi-directory** | ✅ Per-directory child stores | Per-CWD (single) |

---

## 📱 Feature Chiave OpenChamber

### 1. Multi-Directory Sync

```typescript
// child-store.ts
type ChildStoreManager = Map<string, StoreApi<DirectoryStore>>

// Ogni directory ha il suo store indipendente
interface DirectoryStore {
  session: Record<string, Session[]>
  message: Record<string, Message[]>
  part: Record<string, Part[]>
  permission: Record<string, PermissionRequest[]>
  question: Record<string, QuestionRequest[]>
  lsp: LSPState
  command: Command[]
}
```

### 2. Parts Gap Recovery

```typescript
// Se parts mancano, richiede re-fetch
async function repairSessionParts(directory, sessionID, store) {
  const result = await scopedClient.session.messages({ 
    sessionID, 
    limit: RECONNECT_MESSAGE_LIMIT 
  })
  // Patch missing parts
}
```

### 3. Shell Mode & Commands

```typescript
// Shell command
sdk.session.shell({ sessionID, directory, agent, model, command })

// Slash commands
sdk.session.command({ sessionID, directory, command, arguments })
```

### 4. Global Session Status (Sidebar)

```typescript
// Global view per tutte le sessioni
const useAllSessionStatuses(): Record<string, SessionStatus>
```

---

## 🎯 Raccomandazioni per pi-web-app

### ✅ Alta Priorità

1. **Event Coalescing**: Implementare coalescing eventi per evitare duplicati
   - openchamber: `event-pipeline.ts` linee ~180-220
   - Evita di processare eventi obsoleti

2. **Parts Gap Recovery**: Implementare repair per parts mancanti
   - openchamber: `repairSessionParts()` in sync-context.tsx
   - Fallback: re-fetch messaggi su gap detection

3. **Global Session Status**: Aggiungere tracking status globale
   - openchamber: `useAllSessionStatuses()` per sidebar
   - Mostra tutti gli stati sessione in un view

### Media Priorità

4. **Multi-Project Support**: Separare store per progetto/worktree
   - openchamber: `ChildStoreManager` per directory
   - Permette切换 contesto senza perdita stato

5. **Retry UI**: Aggiungere countdown timer per retry
   - Già presente in OpenCode, assente in pi-web-app
   - `session.status.retry` → UI dedicata

6. **Split Server**: Raggruppare route handlers in file separati
   - openchamber: `lib/opencode/*.js`
   - Manutenibilità + testabilità

### Bassa Priorità

7. **Shell Mode**: Supportare `inputMode: "shell"`
   - openchamber: `sdk.session.shell()`
   - Per terminali interattivi

8. **Slash Commands**: Sistema commands interno
   - openchamber: `sdk.session.command()`
   - Pipeline per command discovery

---

## 📝 Note Finali

OpenChamber è essenzialmente un **wrapper React** attorno all'OpenCode SDK con:

- **Punti di forza**:
  - Architecture ben stratificata (sync/providers/stores)
  - Multi-directory support nativo
  - Event coalescing per performance
  - Parts gap recovery
  - SDK ufficiale con full typing

- **Punti deboli**:
  - Codice server molto grande (~1500 righe in un solo file)
  - Mix di CommonJS e ESM
  - Alcuni pattern duplicati tra sync e stores

La differenza principale con pi-web-app è che **OpenChamber delega la logica di gestione sessione all'OpenCode SDK** mentre pi-web-app ha un'integrazione più diretta con il pi SDK in-process.

---

## 🔗 Riferimenti

- [OpenChamber GitHub](https://github.com/openchamber/openchamber)
- [OpenChamber Sync Docs](packages/ui/src/sync/DOCUMENTATION.md)
- [OpenCode SDK](packages/sdk/js/src/)
- [pi-web-app docs](../README.md)
