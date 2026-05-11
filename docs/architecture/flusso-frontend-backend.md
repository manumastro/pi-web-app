# Flusso Frontend ↔ Backend — Pi Web Chat

## Architettura Generale

```
Browser (React)
  │
  ├─ SDK Opencode (@opencode-ai/sdk) ─── SSE/WS ────→ Pi CLI (opencode-go)   [STREAM 1: GLOBALE]
  │                                                      │
  └─ Pi Web frontend ────────────── HTTP/SSE ────→ Pi Web backend            [STREAM 2: DIRECTORY]
                                                      │
                                              ┌───────┴───────┐
                                              │  Orchestrator  │
                                              │  (orchestrator.ts)
                                              └───────┬───────┘
                                                      │
                                              Pi CLI (child process)
```

## Perché ci sono due stream di eventi?

Ci sono **due stream di eventi indipendenti** per lo stesso messaggio assistant:

### Stream 1: Pi CLI nativo (globale)
- Il Pi CLI (`opencode-go`) emette eventi SSE/WS nativi **direttamente** al client SDK.
- Eventi: `message.updated`, `message.part.updated`, `message.part.delta`, `session.status`, ecc.
- Questi eventi usano gli **ID interni del Pi CLI** per i messaggi.
- Alcuni eventi **non contengono `parentID`** (mancano di metadati sul turno).

### Stream 2: Pi Web orchestrator (directory)
- Il Pi Web backend riceve eventi dal child process Pi CLI e li **rimappa** con ID propri (`{messageId}_assistant`).
- L'orchestrator aggiunge metadati mancanti: `parentID`, `providerID`, `modelID`, `mode: 'build'`.
- Questi eventi hanno **sempre `parentID`** e formati coerenti.

### Perché due stream?

1. **Pi CLI** emette eventi nativi perché il SDK OpenChamber è progettato per parlare direttamente col CLI, senza un backend intermedio.
2. **Pi Web backend** ha bisogno del proprio stream perché deve:
   - Arricchire gli eventi con metadati mancanti (`parentID`)
   - Normalizzare gli ID (`{userId}_assistant` invece di UUID interni)
   - Persistere lo stato sessione nel session store
   - Gestire eventi aggiuntivi (tool_call, permission, question)
   - Fornire API REST oltre agli eventi in tempo reale

Il problema è che il frontend riceve **entrambi** gli stream per lo stesso messaggio, con ID diversi.
Il sync layer deve riconoscerli come equivalenti e non duplicarli.

---

## Flusso Completo: Invio Messaggio + Risposta

```
FRONTEND ──────────────────────────────────────────────────────────────────────
                                                                               
  session-ui-store.ts                                                          
  │  optimisticSend() → genera messaggio utente con messageId (UUID)          
  │                                                                            
  ▼                                                                            
  use-sync.ts / session-actions.ts                                             
  │  opencodeClient.sendMessage({ messageId, text, ... })                      
  │  → Chiamata HTTP POST al backend                                          
  │                                                                            
  ▼                                                                            
  ┌──────────────────────────────────────────────────────────────────────┐     
  │  BACKEND ─ API ROUTE (routes/sessions.ts)                            │     
  │                                                                      │     
  │  POST /prompt                                                       │     
  │    │                                                                 │     
  │    ▼                                                                 │     
  │  orchestrator.prompt({                                               │     
  │    sessionId, cwd, message, messageId, model, thinkingLevel          │     
  │  })                                                                  │     
  │                                                                      │     
  │  ┌─────────────────────────────────────────────────────────────┐    │     
  │  │  ORCHESTRATOR (orchestrator.ts)                             │    │     
  │  │                                                             │    │     
  │  │  1. ensureStoredSession()                                   │    │     
  │  │     └→ sessionStore crea/ottiene sessione                   │    │     
  │  │                                                             │    │     
  │  │  2. sessionStore.addMessage({                               │    │     
  │  │       role:'user', messageId, content, model })             │    │     
  │  │                                                             │    │     
  │  │  3. emit(SSE, { type:'message_updated',                     │    │     
  │  │       sessionId, messageId: messageId })                    │    │     
  │  │     └→ EVENT MAPPER → message.updated (user)               │    │     
  │  │                                                             │    │     
  │  │  4. assistantMessageId = `${messageId}_assistant`           │    │     
  │  │     activeTurn = { userMessageId, assistantMessageId, ... } │    │     
  │  │                                                             │    │     
  │  │  5. announceAssistantMessage()                              │    │     
  │  │     └→ emit(SSE, { type:'message_updated',                 │    │     
  │  │         sessionId, messageId: assistantMessageId })         │    │     
  │  │       └→ EVENT MAPPER → message.updated (assistant,        │    │     
  │  │           SINTETICO, senza completed, ma con parentID)      │    │     
  │  │                                                             │    │     
  │  │  6. sessionStore.updateSession({ status:'busy' })           │    │     
  │  │     emit(SSE, { type:'status', status:'busy' })            │    │     
  │  │                                                             │    │     
  │  │  7. runner.send({ type:'send_input', sessionId,             │    │     
  │  │       text: message, messageId })                           │    │     
  │  │     ┌─────────────────────────────────────────────────┐    │    │     
  │  │     │  RUNNER PROCESS (runner-process/main.ts)        │    │    │     
  │  │     │                                                 │    │    │     
  │  │     │  active.assistantMessageId = command.messageId   │    │    │     
  │  │     │  (QUI: usa il messageId raw, SENZA _assistant)  │    │    │     
  │  │     │                                                 │    │    │     
  │  │     │  Pi CLI elabora la richiesta:                   │    │    │     
  │  │     │  ┌───────────────────────────────────────┐      │    │    │     
  │  │     │  │  Pi CLI (opencode-go)                 │      │    │    │     
  │  │     │  │  → messaggio start                    │      │    │    │     
  │  │     │  │  → text_chunk, thinking               │      │    │    │     
  │  │     │  │  → tool_call (se necessario)          │      │    │    │     
  │  │     │  │  → completamento                      │      │    │    │     
  │  │     │  └───────────────────────────────────────┘      │    │    │     
  │  │     │                                                 │    │    │     
  │  │     │  Il Pi CLI EMETTE ANCHE EVENTI NATIVI           │    │    │     
  │  │     │  sullo stream GLOBALE (STREAM 1)               │    │    │     
  │  │     │  → message.updated (con ID interni Pi CLI)     │    │    │     
  │  │     │  → message.part.updated/delta                  │    │    │     
  │  │     │                                                 │    │    │     
  │  │     │  completeTurn():                               │    │    │     
  │  │     │    emit({ type:'done',                          │    │    │     
  │  │     │      sessionId, messageId: active.assistantMessageId })│    │     
  │  │     └─────────────────────────────────────────────────┘    │    │     
  │  │                                                             │    │     
  │  │  8. handleRunnerEvent() processa eventi dal runner         │    │     
  │  │                                                             │    │     
  │  │     [text_chunk]:                                          │    │     
  │  │       resolveAssistantMessageId(event.messageId)           │    │     
  │  │       → lo CORREGGE a `${messageId}_assistant`             │    │     
  │  │       emit(SSE, { type:'text_chunk',                       │    │     
  │  │         messageId: assistantMessageId })                   │    │     
  │  │       └→ EVENT MAPPER → message.part.updated              │    │     
  │  │                                                             │    │     
  │  │     [thinking]: simile a text_chunk                        │    │     
  │  │                                                             │    │     
  │  │     [tool_call / tool_result]:                             │    │     
  │  │       sessionStore.addMessage(role:'tool_call/result')     │    │     
  │  │       emit(SSE, { type:'tool_call/result', ... })          │    │     
  │  │                                                             │    │     
  │  │     [done]:                                                │    │     
  │  │       resolveAssistantMessageId → assistantMessageId       │    │     
  │  │       finalizeAssistant():                                  │    │     
  │  │         sessionStore.addMessage({                           │    │     
  │  │           role:'assistant',                                 │    │     
  │  │           messageId: assistantMessageId,                    │    │     
  │  │           content, model })                                 │    │     
  │  │       emit(SSE, { type:'done',                              │    │     
  │  │         messageId: assistantMessageId })                    │    │     
  │  │       └→ EVENT MAPPER → message.updated (DA STORED)        │    │     
  │  │           + session.idle                                    │    │     
  │  └─────────────────────────────────────────────────────────────┘    │     
  └──────────────────────────────────────────────────────────────────────┘     
                                                                               
  ▼                                                                            
  ┌──────────────────────────────────────────────────────────────────────┐     
  │  EVENT MAPPER (sdk/event-mapper.ts)                                 │     
  │                                                                      │     
  │  Riceve SSE dal orchestrator, produce SDK event                      │     
  │                                                                      │     
  │  message_updated (utente):                                           │     
  │    if stored (trovato): → toSdkMessageInfo(session, stored)         │     
  │    else (sintetico):   → toSdkAssistantMessageInfo(session,          │     
  │                           event.messageId, ..., parentID)            │     
  │                                                                      │     
  │  message_updated (assistant, da announceAssistantMessage):           │     
  │    → stored NOT found (messaggio non ancora persistito)             │     
  │    → toSdkAssistantMessageInfo (sintetico, MA con parentID)          │     
  │                                                                      │     
  │  text_chunk/thinking: → message.part.updated o message.part.delta   │     
  │  tool_call/tool_result: → message.part.updated (tool part)          │     
  │                                                                      │     
  │  done:                                                               │     
  │    if stored (trovato):                                              │     
  │      → message.updated (con toSdkMessageInfo, completo)             │     
  │      + session.idle                                                  │     
  │    else (non trovato, errore):                                       │     
  │      → toSdkAssistantMessageInfo (sintetico, fallback)              │     
  │      + session.idle                                                  │     
  └──────────────────────────────────────────────────────────────────────┘     
                                                                               
  ▼                                                                            
  ┌──────────────────────────────────────────────────────────────────────┐     
  │  FRONTEND ─ SYNC LAYER                                              │     
  │                                                                      │     
  │  event-pipeline.ts:                                                  │     
  │    Connessione SSE/WS agli stream:                                   │     
  │    - STREAM 1: globale (Pi CLI nativo, IDs interni)                 │     
  │    - STREAM 2: directory (orchestrator, IDs normalizzati)           │     
  │    Bufferizza eventi, flush ogni 33ms                                │     
  │    onEvent(directory, payload) → sync-context handleEvent()         │     
  │                                                                      │     
  │  sync-context.tsx handleEvent():                                     │     
  │    Se globale (server.connected, etc.) → reduceGlobalEvent()        │     
  │    Se directory → applyDirectoryEvent()                             │     
  │                                                                      │     
  │  event-reducer.ts applyDirectoryEvent():                            │     
  │    message.updated:                                                  │     
  │      withCanonicalAssistantMessageId(existing, rawInfo)             │     
  │        → PRIMARY: lane key (parentID+provider/model/agent/variant)  │     
  │        → FALLBACK: tempo (50ms, solo se un evento manca parentID)   │     
  │      Binary.search per info.id                                      │     
  │      if found: update in-place                                      │     
  │      else: insert                                                    │     
  │                                                                      │     
  │    message.part.updated:                                             │     
  │      Binary.search parts per part.id                                │     
  │      if found: update (con deduplica delta)                         │     
  │      else: insert                                                    │     
  │                                                                      │     
  │    message.part.delta:                                               │     
  │      appendNonOverlappingDelta()                                     │     
  │                                                                      │     
  │    session.status/idle:                                             │     
  │      draft.session_status[sessionID] = status                       │     
  │                                                                      │     
  │  streaming.ts:                                                       │     
  │    updateStreamingState() deriva stato streaming                     │     
  │    (phase: streaming/cooldown/completed)                             │     
  └──────────────────────────────────────────────────────────────────────┘     
                                                                               
  ▼                                                                            
  ┌──────────────────────────────────────────────────────────────────────┐     
  │  FRONTEND ─ UI (PROIEZIONE + RENDER)                               │     
  │                                                                      │     
  │  useTurnRecords() proietta messaggi in turni:                       │     
  │    projectTurnRecords(messages)                                      │     
  │      → raggruppa per parentID                                       │     
  │      → assegna messaggi orfani al currentTurn                       │     
  │      → activityParts (tool_call, reasoning, ecc.)                   │     
  │      → stabilizeTurnProjection() (evita remount)                    │     
  │      → TurnProjectionResult { turns, ... }                          │     
  │                                                                      │     
  │  MessageList.tsx render:                                             │     
  │    staticTurns → TurnItem[] (memoizzati)                            │     
  │      TurnItem: userMessage + TurnAssistantBlock                     │     
  │        TurnAssistantBlock: assistantMessages.map(renderMessage)     │     
  │    streamingTurn → TurnItem (sempre nuovo riferimento)              │     
  │                                                                      │     
  │  ChatMessage.tsx:                                                    │     
  │    Header: modello, agent, tags                                     │     
  │    Parts: text, reasoning, tool, file, ...                          │     
  └──────────────────────────────────────────────────────────────────────┘     
```

## File Chiave

### Backend
| File | Ruolo |
|------|-------|
| `backend/src/api/routes/sessions.ts` | Endpoint HTTP (prompt, abort, sessioni) |
| `backend/src/runner/orchestrator.ts` | Orchestratore: ciclo di vita sessione, eventi runner |
| `backend/src/runner-process/main.ts` | Child process RPC con Pi CLI |
| `backend/src/api/sdk/event-mapper.ts` | Converte SSE → SDK event |
| `backend/src/api/sdk/mappers.ts` | `toSdkMessageInfo`, `toSdkAssistantMessageInfo`, `toSdkMessages` |
| `backend/src/sessions/store.ts` | Store sessioni in memoria |

### Frontend — Sync
| File | Ruolo |
|------|-------|
| `frontend/src/sync/event-pipeline.ts` | Connessione SSE/WS, buffer, flush |
| `frontend/src/sync/sync-context.tsx` | `handleEvent()` → smista eventi |
| `frontend/src/sync/event-reducer.ts` | `applyDirectoryEvent()`: stato → store |
| `frontend/src/sync/message-canonical.ts` | Canonicalizzazione (lane key + time fallback) |
| `frontend/src/sync/optimistic.ts` | `mergeMessages()`, `mergeOptimisticPage()` |
| `frontend/src/sync/use-sync.ts` | `loadMessages()`, `fetchMessages()` |
| `frontend/src/sync/streaming.ts` | Deriva stato streaming dallo store |
| `frontend/src/sync/session-ui-store.ts` | `optimisticSend()` |
| `frontend/src/sync/part-canonical.ts` | `canonicalizeParts()` |

### Frontend — UI
| File | Ruolo |
|------|-------|
| `frontend/src/components/chat/hooks/useTurnRecords.ts` | Proietta messaggi in turni |
| `frontend/src/components/chat/lib/turns/projectTurnRecords.ts` | Raggruppa per parentID |
| `frontend/src/components/chat/lib/turns/stabilizeTurnProjection.ts` | Stabilizza turni non-finali |
| `frontend/src/components/chat/MessageList.tsx` | Lista virtualizzata |
| `frontend/src/components/chat/components/TurnItem.tsx` | Render turno |
| `frontend/src/components/chat/components/TurnAssistantBlock.tsx` | Render assistant messages |
| `frontend/src/components/chat/ChatMessage.tsx` | Render singolo messaggio |

## Comandi Debug

```bash
# Stato backend
curl http://localhost:3211/health
curl http://localhost:3211/api/opencode/sessions
curl http://localhost:3211/api/session/<SESSION_ID>/message
curl http://localhost:3211/api/session/<SESSION_ID>/status

# Log eventi reducer (temporaneo, aggiungi in event-reducer.ts)
console.debug('[msg-updated]', info.id, info.role,
  'parentID:', (info as any).parentID,
  'completed:', typeof (info.time as any)?.completed === 'number')

# Ispezione store Zustand (da console browser)
window.__store?.getState().message?.['<session-id>']
window.__store?.getState().part?.['<message-id>']
```

## Storico Fix Duplicazione

1. **Fix 1 — Stabilizzazione proiezione**: `projectTurnRecords()` ora chiama `stabilizeTurnProjection()`.  
   *Problema risolto*: remount turni equivalenti su replay/refresh.

2. **Fix 2 — Canonicalizzazione lane key**: `event-reducer.ts` chiama `withCanonicalAssistantMessageId()`.  
   *Problema risolto*: final snapshot con ID diverso ma stesso `parentID`.

3. **Fix 3 — Time-based fallback**: `withCanonicalAssistantMessageId()` con fallback temporale (50ms).  
   *Problema risolto*: eventi Pi CLI nativo senza `parentID` vs orchestrator con `parentID`.

4. **Fix 4 — Semplificazione strutturale**: il `done` non emette più un secondo `message.updated`.  
   Il completamento è segnalato solo da `session.idle`, che nel reducer marca l'ultimo assistant con `time.completed`.  
   *File modificati*:
   - `backend/src/api/sdk/event-mapper.ts` — `done` emette solo `session.idle`
   - `frontend/src/sync/event-reducer.ts` — `session.idle` setta `time.completed` sull'ultimo assistant

5. **Fix 5 — Routing `session.idle` al child store corretto**: `session.idle` (e `session.error`) non avevano
   un campo `directory`, quindi `resolveEventDirectory()` li classificava come `"global"`. In `handleEvent()`,
   gli eventi `"global"` vengono passati a `reduceGlobalEvent()` che ignora `session.idle`, causandone
   la caduta. Il bottone di stop restava visibile perché `session_status` non veniva mai portato a `"idle"`.
   *Fix*: aggiunti `"session.idle"` e `"session.error"` a `getSessionIdFromPayload()` in `sync-context.tsx`,
   permettendo a `resolveDirectoryFromRoutingIndex()` di trovare il child store corretto tramite routing index.
   *File modificati*:
   - `frontend/src/sync/sync-context.tsx` — `getSessionIdFromPayload()` riconosce `session.idle` e `session.error`
