# Piano: Reconnection & Session State Management

## Analisi del Problema Attuale

Quando il client si riconnette (ricarica la pagina) durante una sessione attiva:
1. ❌ Il frontend non riceve lo stato "working" corretto
2. ❌ Non c'è pulsante Stop
3. ❌ Non c'è indicatore di lavorazione
4. ❌ I messaggi arrivano ma il client non sa che l'agente sta lavorando

## Come Funziona OpenCode Web UI (Analisi Completa)

### Fonti Codice Analizzato

| File OpenCode | Descrizione |
|---------------|-------------|
| `frontend/src/stores/sessionStatusStore.ts` | Store Zustand per stato sessione (idle/busy/compact/retry) |
| `frontend/src/hooks/useSSE.ts` | Hook per gestione SSE, reconnection, visibility |
| `frontend/src/lib/sseManager.ts` | Manager SSE con auto-reconnection e exponential backoff |
| `frontend/src/components/message/PromptInput.tsx` | Input area con stop button condizionale |
| `frontend/src/components/message/MessageThread.tsx` | Thread messaggi con stato streaming |
| `frontend/src/pages/SessionDetail.tsx` | Pagina sessione con detection `hasActiveStream` |
| `backend/src/routes/sse.ts` | Route SSE backend con heartbeat |
| `backend/src/services/sse-aggregator.ts` | Aggregator sessioni con state versioning e idle grace |

### Architettura Core

OpenCode usa una combinazione di **Session Status Store** e **Message State** per determinare se mostrare il pulsante Stop.

### 1. Session Status Store (Zustand)

```typescript
// frontend/src/stores/sessionStatusStore.ts
type SessionStatusType = 
  | { type: 'idle' }
  | { type: 'busy' }
  | { type: 'compact' }
  | { type: 'retry'; attempt: number; message: string; next: number }

const sessionStatus = useSessionStatusForSession(sessionId)
const isSessionActive = sessionStatus.type === 'busy' || 
                        sessionStatus.type === 'compact' || 
                        sessionStatus.type === 'retry'
```

### 2. Message State Check

```typescript
const lastAssistantMessage = messages?.filter(m => m.info.role === 'assistant').at(-1)
const hasIncompleteMessages = lastAssistantMessage ? 
  !('completed' in lastAssistantMessage.info.time && lastAssistantMessage.info.time.completed) 
  : false
```

### 3. Active Stream Detection

```typescript
const hasActiveStream = hasIncompleteMessages && isSessionActive
```

### 4. Stop Button Visibility

```typescript
const showStopButton = hasActiveStream
// Il pulsante Stop appare SOLO se:
// 1. Lo stato sessione è busy/compact/retry
// 2. L'ultimo messaggio assistant non ha completed time
```

### 5. Status Update su Eventi SSE

```typescript
// useSSE.ts
case 'session.status': {
  const { sessionID, status } = event.properties
  setSessionStatus(sessionID, status)
  break
}

case 'session.idle': {
  setSessionStatus(sessionID, { type: 'idle' })
  // Marca tutti i tool running come completati
  break
}
```

### 6. Fetch Status on Connect

```typescript
// useSSE.ts
const fetchInitialData = useCallback(async () => {
  const statuses = await client.getSessionStatuses()
  Object.entries(statuses).forEach(([sessionID, status]) => {
    setSessionStatus(sessionID, status)
  })
}, [client])
```

### 7. Visibility Reporting

```typescript
// sseManager.ts
reportVisibility(visible: boolean, activeSessionId?: string): void {
  fetch('/api/sse/visibility', {
    body: JSON.stringify({ clientId, visible, activeSessionId })
  })
}

// useSSE.ts - su connessione
const handleStatusChange = (connected: boolean) => {
  if (connected) {
    fetchInitialData()  // Carica tutti gli stati
    sseManager.reportVisibility(true, currentSessionId)  // Segnala visibilità
  }
}

// su cambio visibilità
document.addEventListener('visibilitychange', () => {
  sseManager.reportVisibility(!document.hidden, currentSessionId)
})
```

### 8. Reconnection Flow OpenCode

```
1. Client SSE si connette
2. Riceve clientId dal server
3. Chiede tutti gli stati sessione (GET /api/sse/status)
4. Server risponde con sessioni attive/inattive
5. Client aggiorna il store
6. I componenti reagiscono al cambio stato
7. Se sessione è busy E messaggio incompleto → mostra Stop
```

### 9. Idle Handling Dettagliato

```typescript
case 'session.idle': {
  const { sessionID } = event.properties
  setSessionStatus(sessionID, { type: 'idle' })
  
  // Marca tutti i tool in esecuzione come completati
  const updated = currentData.map(msgWithParts => {
    const updatedParts = msgWithParts.parts.map(part => {
      if (part.type !== 'tool') return part
      if (part.state.status !== 'running') return part
      return {
        ...part,
        state: {
          ...part.state,
          status: 'completed',
          output: '[Session ended]',
          time: { ...part.state.time, end: Date.now() }
        }
      }
    })
    return { ...msgWithParts, parts: updatedParts }
  })
  queryClient.setQueryData(messagesQueryKey, updated)
  break
}
```

## Implementazione per pi-web-app

### Modifiche Backend (`src/server.ts`)

#### A. Session State Tracking

```typescript
// Aggiungi a CwdSession interface
cwdSession: {
  stateVersion: number;        // Versione stato per race condition
  workingStartTime: number | null; // Timestamp inizio lavorazione
  lastMessageType: string | null;  // Tipo ultimo messaggio
}

// In createCwdSession
const cr: CwdSession = {
  // ... existing fields
  stateVersion: 0,
  workingStartTime: null,
  lastMessageType: null,
}
```

#### B. Aggiorna stato su eventi

```typescript
// In forwardEvent
case "agent_start":
  cr.stateVersion++
  cr.workingStartTime = Date.now()
  break

case "agent_end":
  cr.stateVersion++
  cr.workingStartTime = null
  break

case "message_start":
  cr.lastMessageType = 'message'
  cr.stateVersion++
  break

case "message_end":
  cr.lastMessageType = null
  cr.stateVersion++
  break
```

#### C. Invia stato completo su reconnect

```typescript
// In load_session handler
if (existingCr && existingCr.session.sessionId === sessionId) {
  existingCr.clients.add(ws)
  
  // 1. Session loaded
  ws.send(JSON.stringify({
    type: "session_loaded",
    sessionId: existingCr.session.sessionId,
    sessionFile: existingCr.session.sessionFile,
  }))
  
  // 2. Working state (se attivo)
  if (!existingCr.idle) {
    ws.send(JSON.stringify({ type: "agent_start", isWorking: true }))
    
    if (existingCr.lastMessageType) {
      ws.send(JSON.stringify({
        type: existingCr.lastMessageType + "_start",
        model: existingCr.session.model?.provider + "/" + existingCr.session.model?.id
      }))
    }
  }
  
  // 3. Full state
  ws.send(JSON.stringify({
    type: "state",
    model: existingCr.session.model?.id,
    provider: existingCr.session.model?.provider,
    thinkingLevel: existingCr.session.thinkingLevel,
    messages: existingCr.session.messages.length,
    sessionId: existingCr.session.sessionId,
    sessionFile: existingCr.session.sessionFile,
    isWorking: !existingCr.idle,
    stateVersion: existingCr.stateVersion,
    workingDuration: existingCr.workingStartTime ? Date.now() - existingCr.workingStartTime : null,
    cwd: existingCr.cwd,
  }))
  
  // 4. Full message history
  ws.send(JSON.stringify({
    type: "rpc_response",
    command: "get_messages",
    data: {
      messages: existingCr.session.messages,
      isWorking: !existingCr.idle,
      sessionId: existingCr.session.sessionId,
    }
  }))
  
  // 5. Invia stato a tutti i client (non solo il nuovo)
  broadcastToClients(existingCr, {
    type: "state",
    // ... tutti i campi
  })
  
  return
}
```

#### D. Visibility Reporting

```typescript
// Handler per messaggio report_visibility
if (msg.type === "report_visibility") {
  const clientId = (ws as any).clientId
  ;(ws as any).visible = msg.visible
  ;(ws as any).activeSessionId = msg.activeSessionId
  console.log(`👁️ Client ${clientId} visibility: ${msg.visible} (session: ${msg.activeSessionId})`)
}
```

### Modifiche Frontend

#### A. Session Status Store

Crea `frontend/src/stores/sessionStatusStore.ts`:

```typescript
import { create } from 'zustand'

type SessionStatus = 'idle' | 'working' | 'streaming'

interface SessionStatusState {
  // Map sessionId -> status
  statuses: Record<string, SessionStatus>
  workingStartTime: Record<string, number | null>
  
  setStatus: (sessionId: string, status: SessionStatus) => void
  setWorkingStartTime: (sessionId: string, time: number | null) => void
  getStatus: (sessionId: string) => SessionStatus
  getWorkingDuration: (sessionId: string) => number | null
  clearStatus: (sessionId: string) => void
}

export const useSessionStatusStore = create<SessionStatusState>((set, get) => ({
  statuses: {},
  workingStartTime: {},
  
  setStatus: (sessionId, status) => set(state => ({
    statuses: { ...state.statuses, [sessionId]: status }
  })),
  
  setWorkingStartTime: (sessionId, time) => set(state => ({
    workingStartTime: { ...state.workingStartTime, [sessionId]: time }
  })),
  
  getStatus: (sessionId) => get().statuses[sessionId] || 'idle',
  
  getWorkingDuration: (sessionId) => {
    const startTime = get().workingStartTime[sessionId]
    if (!startTime) return null
    return Date.now() - startTime
  },
  
  clearStatus: (sessionId) => set(state => {
    const { [sessionId]: _, ...rest } = state.statuses
    const { [sessionId]: __, ...restStart } = state.workingStartTime
    return { statuses: rest, workingStartTime: restStart }
  })
}))
```

#### B. WebSocket Hook con State Management

Aggiorna il hook WebSocket per:
1. Inviare `report_visibility` su connessione
2. Gestire tutti i messaggi di stato
3. Aggiornare lo store

```typescript
// In WebSocket hook
const setStatus = useSessionStatusStore(s => s.setStatus)
const setWorkingStartTime = useSessionStatusStore(s => s.setWorkingStartTime)

ws.onopen = () => {
  // Segnala visibilità
  ws.send(JSON.stringify({
    type: "report_visibility",
    visible: !document.hidden,
    activeSessionId: currentSessionId
  }))
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  
  switch (msg.type) {
    case "agent_start":
      setStatus(currentSessionId, 'working')
      setWorkingStartTime(currentSessionId, Date.now())
      break
      
    case "turn_start":
      setStatus(currentSessionId, 'streaming')
      break
      
    case "turn_end":
      setStatus(currentSessionId, 'working')
      break
      
    case "agent_end":
    case "done":
      setStatus(currentSessionId, 'idle')
      setWorkingStartTime(currentSessionId, null)
      break
      
    case "state":
      if (msg.isWorking) {
        setStatus(currentSessionId, 'working')
        if (msg.workingDuration) {
          setWorkingStartTime(currentSessionId, Date.now() - msg.workingDuration)
        }
      }
      break
  }
}

// Su cambio visibilità
document.addEventListener("visibilitychange", () => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "report_visibility",
      visible: !document.hidden,
      activeSessionId: currentSessionId
    }))
  }
})
```

#### C. Stop Button Component

```typescript
function StopButton({ sessionId }: { sessionId: string }) {
  const status = useSessionStatusStore(s => s.getStatus(sessionId))
  const workingStartTime = useSessionStatusStore(s => s.workingStartTime[sessionId])
  const [duration, setDuration] = useState(0)
  
  // Aggiorna durata ogni secondo
  useEffect(() => {
    if (!workingStartTime) return
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - workingStartTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [workingStartTime])
  
  if (status === 'idle') return null
  
  return (
    <div className="flex items-center gap-2">
      {status === 'working' && (
        <span className="text-sm text-muted-foreground">
          Working for {duration}s...
        </span>
      )}
      {status === 'streaming' && (
        <span className="text-sm text-muted-foreground">
          Streaming...
        </span>
      )}
      <button
        onClick={() => sendAbort()}
        className="px-3 py-1 bg-red-500 text-white rounded"
      >
        Stop
      </button>
    </div>
  )
}
```

#### D. Connection Status Indicator

```typescript
function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${connected ? 'text-green-500' : 'text-red-500'}`}>
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
      <span className="text-xs">{connected ? 'Connected' : 'Reconnecting...'}</span>
    </div>
  )
}
```

---

## Piano di Implementazione per pi-web-app

### Fase 1: Client ID & Visibility Reporting

#### Backend (`src/server.ts`)

1. **Assegna Client ID a ogni connessione WebSocket**

```typescript
wss.on("connection", (ws: WebSocket, req) => {
  if (!authenticateWs(ws, req)) return;

  const clientId = `ws_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  (ws as any).clientId = clientId;
  (ws as any).visible = false;
  (ws as any).activeSessionId = null;

  console.log(`🔌 Client connected: ${clientId}`);
```

2. **Gestisci messaggio `report_visibility`**

```typescript
if (msg.type === "report_visibility") {
  (ws as any).visible = msg.visible;
  (ws as any).activeSessionId = msg.activeSessionId;
  console.log(`👁️ Client ${clientId} visibility: ${msg.visible} (session: ${msg.activeSessionId})`);
}
```

3. **Invia stato working quando client si connette a sessione attiva**

```typescript
if (existingCr && existingCr.session.sessionId === sessionId) {
  existingCr.clients.add(ws);
  
  // Send current working state immediately
  if (!existingCr.idle) {
    ws.send(JSON.stringify({ type: "agent_start", isWorking: true }));
    ws.send(JSON.stringify({ 
      type: "turn_start", 
      model: existingCr.session.model?.provider + "/" + existingCr.session.model?.id 
    }));
  }
  
  // Send full state
  setTimeout(() => {
    broadcastToClients(existingCr, { type: "state", ... });
    broadcastToClients(existingCr, { type: "rpc_response", command: "get_messages", ... });
  }, 100);
}
```

#### Frontend

1. **Invia visibility su connessione**

```typescript
// In useWebSocket o similar
ws.onopen = () => {
  send({ type: "report_visibility", visible: true, activeSessionId: currentSessionId })
}

// When page becomes visible
document.addEventListener("visibilitychange", () => {
  send({ type: "report_visibility", visible: !document.hidden, activeSessionId: currentSessionId })
})
```

### Fase 2: Session State Tracking con Versioning

#### Backend

1. **Aggiungi state tracking a CwdSession**

```typescript
interface CwdSession {
  // ... existing fields
  stateVersion: number;           // Versione dello stato
  workingStartTime: number | null; // Timestamp inizio lavorazione
}

// In createCwdSession
const cr: CwdSession = {
  // ... existing
  stateVersion: 0,
  workingStartTime: null,
};

// When agent starts
case "agent_start":
  cr.idle = false;
  cr.stateVersion++;
  cr.workingStartTime = Date.now();
  break;

// When agent ends
case "agent_end":
  cr.idle = true;
  cr.stateVersion++;
  cr.workingStartTime = null;
  break;
```

2. **Invia stato completo su richiesta**

```typescript
if (msg.type === "get_state") {
  const cr = findSessionForClient(ws) || cwdSessions.get(cwd);
  if (cr) {
    ws.send(JSON.stringify({
      type: "state",
      model: cr.session.model?.id,
      provider: cr.session.model?.provider,
      thinkingLevel: cr.session.thinkingLevel,
      messages: cr.session.messages.length,
      sessionId: cr.session.sessionId,
      sessionFile: cr.session.sessionFile,
      isWorking: !cr.idle,
      stateVersion: cr.stateVersion,
      workingDuration: cr.workingStartTime ? Date.now() - cr.workingStartTime : null,
      cwd: cr.cwd,
    }));
  }
}
```

### Fase 3: Idle Grace Period

#### Backend

1. **Non marcare sessione come idle immediatamente**

```typescript
private idleTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()

function markIdleDelayed(cr: CwdSession, delayMs: number = 5000): void {
  const key = cr.cwd;
  
  // Cancel existing timeout
  const existing = idleTimeouts.get(key);
  if (existing) clearTimeout(existing);
  
  // Schedule idle marking
  const timeout = setTimeout(() => {
    // Check if any client is viewing this session
    const hasViewers = Array.from(cr.clients).some(
      (ws: any) => ws.visible && ws.activeSessionId === cr.session.sessionId
    );
    
    if (!hasViewers) {
      cr.idle = true;
      cr.stateVersion++;
      cr.workingStartTime = null;
      console.log(`⏰ [${cr.cwd}] Session marked idle after grace period`);
    }
    idleTimeouts.delete(key);
  }, delayMs);
  
  idleTimeouts.set(key, timeout);
}
```

### Fase 4: Connection Status UI

#### Frontend

1. **Mostra stato connessione nell'UI**

```typescript
// Connection indicator component
function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${connected ? 'text-green-500' : 'text-red-500'}`}>
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
      <span>{connected ? 'Connected' : 'Reconnecting...'}</span>
    </div>
  )
}
```

2. **Mostra durata lavorazione**

```typescript
// Working duration component
function WorkingIndicator({ startTime }: { startTime: number }) {
  const [duration, setDuration] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(Date.now() - startTime)
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])
  
  return (
    <div className="flex items-center gap-2 text-blue-500">
      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      <span>Working for {formatDuration(duration)}...</span>
    </div>
  )
}
```

### Fase 5: Full State Restoration on Reconnect

#### Backend

Quando un client si riconnette, invia stato completo:

```typescript
// In load_session handler
if (existingCr && existingCr.session.sessionId === sessionId) {
  existingCr.clients.add(ws);
  
  const clientId = (ws as any).clientId;
  console.log(`🔌 Client ${clientId} reconnected to session ${sessionId}`);
  
  // 1. Session loaded
  ws.send(JSON.stringify({
    type: "session_loaded",
    sessionId: existingCr.session.sessionId,
    sessionFile: existingCr.session.sessionFile,
  }));
  
  // 2. Working state (if working)
  if (!existingCr.idle) {
    ws.send(JSON.stringify({ type: "agent_start", isWorking: true }));
    ws.send(JSON.stringify({ 
      type: "turn_start",
      model: existingCr.session.model?.provider + "/" + existingCr.session.model?.id
    }));
  }
  
  // 3. Full state
  ws.send(JSON.stringify({
    type: "state",
    model: existingCr.session.model?.id,
    provider: existingCr.session.model?.provider,
    thinkingLevel: existingCr.session.thinkingLevel,
    messages: existingCr.session.messages.length,
    sessionId: existingCr.session.sessionId,
    sessionFile: existingCr.session.sessionFile,
    isWorking: !existingCr.idle,
    stateVersion: existingCr.stateVersion,
    workingDuration: existingCr.workingStartTime ? Date.now() - existingCr.workingStartTime : null,
    cwd: existingCr.cwd,
  }));
  
  // 4. Full message history
  ws.send(JSON.stringify({
    type: "rpc_response",
    command: "get_messages",
    data: {
      messages: existingCr.session.messages,
      isWorking: !existingCr.idle,
      sessionId: existingCr.session.sessionId,
    }
  }));
  
  // 5. Tool results (if any tool is currently executing)
  // (Need to track this)
  
  return;
}
```

#### Frontend

Gestisci tutti i messaggi di stato:

```typescript
// In WebSocket message handler
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  
  switch (msg.type) {
    case "agent_start":
      setIsWorking(msg.isWorking)
      break
      
    case "turn_start":
      setCurrentModel(msg.model)
      break
      
    case "state":
      setSessionState(msg)
      if (msg.workingDuration) {
        setWorkingStartTime(Date.now() - msg.workingDuration)
      }
      break
      
    case "done":
      setIsWorking(false)
      setWorkingStartTime(null)
      break
  }
}
```

---

## Riepilogo Modifiche

### Backend (`src/server.ts`)

| Modifica | Descrizione |
|----------|-------------|
| Client ID | Assegna ID univoco a ogni connessione WS |
| Visibility | Gestisce messaggio `report_visibility` |
| State Version | Aggiunge `stateVersion` e `workingStartTime` a CwdSession |
| Idle Grace | Implementa delay prima di marcare sessione come idle |
| Full State | Invia stato completo su reconnect |
| Tool Tracking | Tiene traccia del tool in esecuzione |

### Frontend

| Modifica | Descrizione |
|----------|-------------|
| Visibility | Invia `report_visibility` su connessione e cambio visibilità |
| Connection Status | Mostra stato connessione nell'UI |
| Working Indicator | Mostra durata lavorazione in tempo reale |
| State Handler | Gestisce tutti i messaggi di stato |
| Auto-reconnect | Riconnessione automatica con backoff |

---

## Test Cases

1. **Ricarica durante lavorazione** → Deve mostrare working indicator
2. **Ricarica dopo fine lavorazione** → Deve mostrare stato idle
3. **Disconnessione temporanea** → Deve riconnettere e ripristinare stato
4. **Pagina nascosta** → Deve mantenere connessione attiva
5. **Stop durante lavorazione** → Deve fermare agente
6. **Stop dopo reconnect** → Deve funzionare normalmente

---

## Priorità

1. **Alta**: Phase 1 (Client ID & Visibility) - Risolve il problema principale
2. **Media**: Phase 2 (State Tracking) - Migliora robustezza
3. **Bassa**: Phase 3 (Idle Grace) - Ottimizzazione
4. **Bassa**: Phase 4 (Connection UI) - UX improvement
5. **Media**: Phase 5 (Full Restoration) - Garantisce coerenza

---

## ✅ Modifiche Completate

### Backend (`src/server.ts`)

| Modifica | Stato | Descrizione |
|----------|-------|-------------|
| Client ID | ✅ | Assegna ID univoco a ogni connessione WS |
| Visibility | ✅ | Gestisce messaggio `report_visibility` |
| State Version | ✅ | Aggiunge `stateVersion`, `workingStartTime`, `lastEventType` a CwdSession |
| State Update | ✅ | Aggiorna stato su `agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start` |
| Full State on Reconnect | ✅ | Invia stato completo quando client si riconnette |
| get_state Update | ✅ | Incluse nuovi campi in risposta |

### Frontend (`frontend/src/App.tsx`)

| Modifica | Stato | Descrizione |
|----------|-------|-------------|
| Turn Handlers | ✅ | Handler per `turn_start` e `turn_end` |
| Visibility Reporting | ✅ | Invia `report_visibility` su connessione e cambio visibilità |
| Model Update | ✅ | Aggiorna modello da `turn_start` |

### Come funziona ora

Quando il client si riconnette:
1. ✅ Server assegna `clientId` univoco
2. ✅ Client invia `report_visibility` su connessione
3. ✅ Client invia `load_session` per ripristinare sessione
4. ✅ Server invia `session_loaded`, `agent_start` (se working), `turn_start` (se in turno)
5. ✅ Server invia `state` con `isWorking: true`, `stateVersion`, `workingDuration`
6. ✅ Server invia `get_messages` per storico completo
7. ✅ Frontend riceve `agent_start` → setta `isBusy = true`
8. ✅ Frontend riceve `state` → setta `isWorking`, aggiorna stato
9. ✅ Frontend mostra pulsante Stop e indicatore lavorazione
