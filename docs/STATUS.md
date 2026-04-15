# Pi Web App — Implementation Status

> Ultimo aggiornamento: 2026-04-15

---

## 📊 Panoramica Completa

Questo documento traccia lo stato di implementazione di **tutte** le funzionalità confrontando pi-web-app con le architetture di riferimento **OpenCode** e **OpenChamber**.

---

## ✅ COMPLETATO

### Fase 1: Refactoring WebSocket → SSE

| Funzionalità | File | Stato |
|-------------|------|-------|
| WebSocket rimosso | `src/server.ts` | ✅ |
| SSE events endpoint | `src/routes/events.ts` | ✅ |
| REST routes | `src/routes/messages.ts`, `sessions.ts` | ✅ |
| Frontend SSE hook | `frontend/src/hooks/useSSE.ts` | ✅ |
| useResumableSSE hook | `frontend/src/hooks/useResumableSSE.ts` | ✅ |
| Error categorizer | `src/services/errorCategorizer.ts` | ✅ |
| Types extracted | `src/types/` | ✅ |

**Commit**: `dff5879`, `59580ac`, `5d5c822`, `aea7dd9`, `ef2a9b1`, `6c9cef5`, `7be66e1`

---

### Fase 2: Migliorie Implementate

| Funzionalità | File | Stato |
|-------------|------|-------|
| Event Pipeline | `frontend/src/sync/event-pipeline.ts` | ✅ |
| Exponential backoff + jitter | `frontend/src/sync/retry.ts` | ✅ |
| Session State Machine | `frontend/src/sync/session-state.ts` | ✅ |
| Sync Context Provider | `frontend/src/sync/sync-context.tsx` | ✅ |
| Enhanced Session Status Store | `frontend/src/stores/sessionStatusStore.ts` | ✅ |
| RetryBanner Component | `frontend/src/components/RetryBanner.tsx` | ✅ |
| UI Components | `frontend/src/components/ui.tsx` | ✅ |

---

### Fase 3: Test Suite

| Test | File | Passanti |
|------|------|----------|
| EventPipeline tests | `frontend/src/sync/event-pipeline.test.ts` | ✅ 8 |
| Retry tests | `frontend/src/sync/retry.test.ts` | ✅ 25 |
| SessionState tests | `frontend/src/sync/session-state.test.ts` | ✅ 42 |
| useSSE tests | `frontend/src/hooks/useSSE.test.ts` | ✅ 12 |
| **Totale** | | **97 tests** |

---

### Fase 4: Bug Fix

| Bug | Fix |
|-----|-----|
| Server logs non si aggiornavano | Aggiunta broadcast SSE in `broadcastLog()` |
| Dead code WebSocket (~600 righe) | Rimosso codice non utilizzato |

---

## ❌ ANCORA DA IMPLEMENTARE

### Priorità ALTA

#### 1. Event Coalescing ⚠️ Parziale

**Riferimento**: OpenChamber `event-pipeline.ts` linee ~180-220

**Cosa fa**: Evita di processare eventi duplicati quando arrivano fuori ordine o dopo riconnessione.

**Stato attuale**: 
- Dependency tracking: ✅ Implementato
- Deduplication: ✅ Implementato  
- Coalescing vero e proprio: ❌ Non implementato

**Pattern OpenChamber**:
```typescript
const key = (payload: Event): string | undefined => {
  if (payload.type === "message.part.updated") 
    return `message.part.updated:${part.messageID}:${part.id}`
  if (payload.type === "message.part.delta") 
    return `message.part.delta:${messageID}:${partID}:${field}`
}
```

**TODO**: Implementare coalescing nel `EventPipeline` per deduplicare eventi con stessa key.

---

#### 2. Parts Gap Recovery ❌ Non implementato

**Riferimento**: OpenChamber `sync-context.tsx`

**Cosa fa**: Quando mancano parti di un messaggio dopo riconnessione, richiede re-fetch e fa patch.

**Pattern OpenChamber**:
```typescript
async function repairSessionParts(directory, sessionID, store) {
  const result = await scopedClient.session.messages({ 
    sessionID, 
    limit: RECONNECT_MESSAGE_LIMIT 
  })
  // Patch missing parts
}
```

**TODO**: 
- Rilevare gap nella sequenza di eventi
- Chiamare endpoint `/api/sessions/:id` per re-fetch messaggi
- Patch dei messaggi mancanti nel frontend

---

#### 3. Global Session Status ❌ Non implementato

**Riferimento**: OpenChamber `useAllSessionStatuses()`

**Cosa fa**: Mostra nella sidebar lo status di tutte le sessioni (`idle`, `busy`, `retry`).

**Attuale**: Solo status per sessione singola in `sessionStatusStore`.

**TODO**:
```typescript
interface GlobalSessionStatusStore {
  statuses: Record<string, SessionStatus>
  // SessionStatus: idle | busy | retry
}
```

---

### Priorità MEDIA

#### 4. Multi-Project Support ❌ Non implementato

**Riferimento**: OpenChamber `ChildStoreManager`

**Cosa fa**: Store separati per ogni directory/project.

**Attuale**: Single store per l'intera app.

**TODO**:
```typescript
// Ogni directory ha il suo store indipendente
type ChildStoreManager = Map<string, StoreApi<DirectoryStore>>

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

---

#### 5. Question System ❌ Non implementato

**Riferimento**: OpenCode `sdk.session.message()`

**Cosa fa**: Quando l'AI richiede input all'utente (domande, clarification).

**TODO**:
```typescript
// Evento dal server
{ type: "question.asked", properties: { requestID, questions } }

// Risposta dal client
POST /api/sessions/:id/question { answers: [...] }
```

**UI necessaria**: Modal input per rispondere alle domande dell'AI.

---

#### 6. Permission System ❌ Non implementato

**Riferimento**: OpenCode permission handling

**Cosa fa**: Quando l'AI richiede permesso per eseguire azioni (exec bash, modifica file, etc.).

**TODO**:
```typescript
// Evento dal server
{ type: "permission.asked", properties: { requestID, ... } }

// Risposta dal client
POST /api/sessions/:id/permission { approved: boolean }
```

**UI necessaria**: Modal approve/deny per permissions.

---

#### 7. Error Pattern Detection ⚠️ Parziale

**Riferimento**: OpenCode error detection patterns

**Attuale**: `errorCategorizer.ts` categorizza errori base.

**Mancante**: Provider-specific patterns.

**TODO**:
```typescript
// Error patterns per provider
const PROVIDER_ERROR_PATTERNS = {
  anthropic: {
    rate_limit: /overload_error/i,
    quota: /billing_error/i,
  },
  openai: {
    rate_limit: /429/i,
    quota: /exceeded your quota/i,
  },
  // ...
}
```

---

### Priorità BASSA

#### 8. Shell Mode ❌ Non implementato

**Riferimento**: OpenChamber `sdk.session.shell()`

**Cosa fa**: Supporto per terminali interattivi.

**TODO**:
```typescript
sdk.session.shell({ sessionID, directory, agent, model, command })
```

---

#### 9. Slash Commands ❌ Non implementato

**Riferimento**: OpenChamber `sdk.session.command()`

**Cosa fa**: Pipeline per command discovery e slash commands interni.

**TODO**:
```typescript
sdk.session.command({ sessionID, directory, command, arguments })
```

---

#### 10. Todo System ❌ Non implementato

**Riferimento**: OpenCode `todo.updated`

**Cosa fa**: Tracking dei todos generati dall'AI.

**TODO**:
```typescript
// Evento
{ type: "todo.updated", properties: { sessionID, todos } }

// GET /api/sessions/:id/todo
```

---

## 🐛 Bug Conosciuti

### PAUSE/RESUME Non Funzionanti

**File**: `frontend/src/sync/session-state.ts`

**Problema**: 
- `PAUSE` non è transizione valida da nessuno stato
- Non c'è modo di raggiungere lo stato `paused`

**Stato**: Test skippati con `it.skip()`

**Fix necessario**: Aggiungere `PAUSE` alle transizioni valide (probabilmente da `streaming`).

---

## 📈 Statistiche

| Metrica | Valore |
|---------|--------|
| Test passanti | 97 |
| Test skippati | 2 |
| File test | 4 |
| Funzionalità completate | 15+ |
| Funzionalità mancanti | 10 |
| Righe codice rimosse (WS) | ~600 |

---

## 🗂️ Struttura File Attuale

```
pi-web-app/
├── src/
│   ├── server.ts                    # Main server (~1100 righe, senza WS)
│   ├── routes/
│   │   ├── events.ts               # SSE endpoint
│   │   ├── messages.ts             # REST: prompt, steer, abort
│   │   └── sessions.ts            # REST: sessions, model, load
│   └── services/
│       └── errorCategorizer.ts
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── sync/
│   │   │   ├── event-pipeline.ts
│   │   │   ├── retry.ts
│   │   │   ├── session-state.ts
│   │   │   └── sync-context.tsx
│   │   ├── hooks/
│   │   │   ├── useSSE.ts
│   │   │   └── useResumableSSE.ts
│   │   ├── stores/
│   │   │   └── sessionStatusStore.ts
│   │   └── components/
│   │       ├── RetryBanner.tsx
│   │       └── ui.tsx
│   └── tests/
│       └── *.test.ts              # 97 tests
└── docs/
    ├── OPENCODE_ANALYSIS.md
    ├── OPENCHAMBER_ANALYSIS.md
    ├── REFACTORING_PLAN.md
    ├── IMPLEMENTED_IMPROVEMENTS.md
    └── TESTING_ROADMAP.md
```

---

## 🎯 Prossimi Passi Consigliati

### Step 1: Fix Bug Criticali
- [ ] Fix PAUSE/RESUME nello state machine
- [ ] Verificare RetryBanner countdown funziona

### Step 2: Features Alta Priorità  
- [ ] Implementare Event Coalescing
- [ ] Implementare Parts Gap Recovery
- [ ] Aggiungere Global Session Status

### Step 3: Features Media Priorità
- [ ] Implementare Question System + UI
- [ ] Implementare Permission System + UI
- [ ] Multi-Project Support

### Step 4: Features Baja Priorità
- [ ] Shell Mode
- [ ] Slash Commands
- [ ] Todo System

---

## 📚 Riferimenti

- [OpenChamber GitHub](https://github.com/openchamber/openchamber)
- [OpenCode GitHub](https://github.com/anomalyco/opencode)
- [Vitest](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
