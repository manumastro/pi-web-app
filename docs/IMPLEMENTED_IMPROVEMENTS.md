# Migliorie Implementate in pi-web-app

> Basato su: [OpenCode Web UI](./OPENCODE_ANALYSIS.md) e [OpenChamber](./OPENCHAMBER_ANALYSIS.md)

---

## 📋 Riepilogo Migliorie

### ✅ 1. Event Pipeline con Buffering e Deduplicazione

**File**: `frontend/src/sync/event-pipeline.ts`

Implementato un sistema di event pipeline che:

- **Bufferizza eventi** per garantire l'ordine corretto di elaborazione
- **Rileva dipendenze** tra eventi (es. `text_delta` dipende da `text_start`)
- **Deduplica eventi** per evitare duplicati durante riconnessioni
- **Caching eventi** per supporto a resumption dopo riconnessione

```typescript
// Esempio di utilizzo
const pipeline = new EventPipeline('cwd', (events) => {
  for (const event of events) {
    // process event
  }
});

pipeline.push(event);
```

### ✅ 2. Exponential Backoff con Jitter

**File**: `frontend/src/sync/retry.ts`

Implementato un sistema di retry robusto ispirato a AWS architecture:

- **Exponential backoff**: `delay = min(base * 2^attempt, maxDelay)`
- **Full Jitter**: randomizzazione per evitare thundering herd
- **Error categorization**: rilevamento automatico del tipo di errore
- **Adaptive retry**: configurazione basata sulla categoria di errore

```typescript
// Categorie errori supportate
type ErrorCategory = 
  | 'rate_limit'    // 5s base delay
  | 'quota'         // 10s base delay  
  | 'overload'      // 2s base delay
  | 'timeout'       // 2s base delay
  | 'network'       // 1s base delay
  | 'server_error'  // 3s base delay
  | 'auth'          // non retryable
  | 'api'           // non retryable
  | 'unknown';
```

### ✅ 3. Session State Machine

**File**: `frontend/src/sync/session-state.ts`

Implementata una macchina a stati per gestire il ciclo di vita della sessione:

- **Stati**: `idle`, `connecting`, `connected`, `loading`, `working`, `streaming`, `paused`, `error`, `reconnecting`, `disconnected`
- **Transizioni esplicite** con validazione
- **History** delle transizioni per debugging
- **Listener pattern** per aggiornamenti UI

```typescript
const sm = new SessionStateMachine();
sm.transition({ type: 'CONNECT' });
sm.subscribe((newState, prevState) => {
  console.log(`State: ${prevState} → ${newState}`);
});
```

### ✅ 4. Sync Context Provider

**File**: `frontend/src/sync/sync-context.tsx`

Provider React che integra:

- **Event Pipeline** per buffering e deduplicazione
- **Retry Scheduler** per riconnessioni automatiche
- **Session Manager** per tracking stato sessioni
- **Connection State** (`connected`, `reconnecting`, etc.)

```tsx
<SyncProvider 
  cwd={selectedCwd}
  sessionId={sessionId}
  onEvent={(event) => handleEvent(event)}
>
  {children}
</SyncProvider>
```

### ✅ 5. Hook useResumableSSE

**File**: `frontend/src/hooks/useResumableSSE.ts`

Hook SSE avanzato con:

- **Auto-reconnect** con exponential backoff
- **Event caching** per resumption
- **Deduplication** degli eventi
- **Retry state** callback per UI

```typescript
const { connected, reconnecting, retryInfo, send, reconnect } = useResumableSSE({
  cwd,
  onEvent,
  onRetryStateChange: (state) => setRetryState(state),
});
```

### ✅ 6. Improved useSSE Hook

**File**: `frontend/src/hooks/useSSE.ts`

Aggiornato il hook SSE esistente con:

- **Exponential backoff + jitter** per riconnessioni
- **RetryInfo state** per UI feedback
- **Error categorization** per retry adattivi

```typescript
interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  nextRetryTime: number;
  delayMs: number;
}
```

### ✅ 7. Enhanced Session Status Store

**File**: `frontend/src/stores/sessionStatusStore.ts`

Zustand store migliorato con:

- **State Machine** integrata per transizioni automatiche
- **State History** per debugging
- **Connection State** tracking (`disconnected`, `connecting`, `connected`, `reconnecting`)
- **Error categorization** helper functions

```typescript
// Il store processa automaticamente eventi
processEvent(sessionId, event);  // Aggiorna stato automaticamente

// History per debugging
const history = getStateHistory(sessionId);
// [{ from: 'idle', to: 'connecting', transition: 'CONNECT', timestamp: ... }]
```

### ✅ 8. Enhanced RetryBanner Component

**File**: `frontend/src/components/RetryBanner.tsx`

Componente UI avanzato per retry:

- **Progress ring** SVG animato
- **Error categorization** con icone specifiche
- **Retry countdown** in tempo reale
- **Action buttons** (Retry Now, Cancel)
- **Variants**: full banner, compact indicator, reconnecting banner

```tsx
<RetryBanner
  sessionId={sessionId}
  delayMs={5000}
  onRetryNow={() => reconnect()}
  onCancel={() => cancelRetry()}
/>
```

### ✅ 9. UI Components (CodeBlock, StatusBadge, DiffView, ToolCall)

**File**: `frontend/src/components/ui.tsx`

Componenti UI avanzati ispirati a OpenCode:

- **CodeBlock**: syntax highlighting, copy button, line numbers
- **StatusBadge**: indicatore stato con animazione pulse
- **DiffView**: visualizzazione differenze file
- **ToolCallDisplay**: componente per tool call con expand/collapse
- **EnhancedFileTree**: tree view migliorato

---

## 📁 Struttura File Modificati

```
frontend/src/
├── sync/
│   ├── index.ts              # Module exports
│   ├── event-pipeline.ts     # Event buffering & deduplication
│   ├── retry.ts              # Exponential backoff + jitter
│   ├── session-state.ts      # State machine
│   └── sync-context.tsx      # React provider
├── hooks/
│   ├── useSSE.ts            # Updated with retry
│   └── useResumableSSE.ts   # New resumable SSE hook
├── stores/
│   └── sessionStatusStore.ts # Enhanced with state machine
├── components/
│   ├── RetryBanner.tsx       # Enhanced retry UI
│   └── ui.tsx               # New UI components
└── types.ts                 # Added server.connected, turnIndex, messageIndex
```

---

## 🎯 Confronto Prima/Dopo

| Aspetto | Prima | Dopo |
|---------|-------|------|
| **Retry** | Fixed 3s delay | Exponential backoff + jitter |
| **Event deduplication** | ❌ | ✅ |
| **Event buffering** | ❌ | ✅ |
| **Session state** | Simple enum | State machine |
| **Retry UI** | Basic | Progress ring + countdown |
| **Error categorization** | Manual | Automatic detection |
| **CodeBlock** | ❌ | ✅ |
| **DiffView** | ❌ | ✅ |

---

## 🔧 Utilizzo

### Resumable SSE

```typescript
import { useResumableSSE } from './hooks/useResumableSSE';

function App() {
  const { connected, retryInfo, send } = useResumableSSE({
    cwd: selectedCwd,
    onEvent: handleEvent,
    onRetryStateChange: (state) => {
      console.log(`Retry attempt ${state?.attempt}/${state?.maxAttempts}`);
    },
  });
  
  // ...
}
```

### Retry Scheduler

```typescript
import { createRetrySchedulerForError } from './sync/retry';

// Adattivo basato su categoria errore
const scheduler = createRetrySchedulerForError('Rate limit exceeded');

scheduler.setCallbacks(
  (state) => console.log(`Retrying... attempt ${state.attempt}`),
  () => console.error('Max attempts exhausted')
);

scheduler.schedule();
```

### Session State Machine

```typescript
import { SessionStateMachine } from './sync/session-state';

const sm = new SessionStateMachine();

// Process events automatically
sm.processEvent({ type: 'agent_start' }); // idle → working
sm.processEvent({ type: 'done' });         // working → connected
```

---

## 📚 Riferimenti

- [OpenCode Architecture Analysis](./OPENCODE_ANALYSIS.md)
- [OpenChamber Architecture Analysis](./OPENCHAMBER_ANALYSIS.md)
- [AWS Exponential Backoff](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [OpenChamber Sync](https://github.com/openchamber/openchamber/tree/main/packages/ui/src/sync)
