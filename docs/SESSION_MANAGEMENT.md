# Session State Management & Reconnection

Questa documentazione descrive l'architettura implementata per la gestione dello stato della sessione e il ripristino della connessione in **pi-web-app**.

L'implementazione di questo modulo è stata sviluppata prendendo ispirazione dalla **OpenCode Web UI**, adottandone l'approccio coordinato tra frontend e backend per garantire che l'utente mantenga una visione coerente dello stato dell'agente, anche dopo ricaricamenti della pagina o interruzioni della connessione.

## 🎯 Obiettivi dell'Architettura

Il sistema è progettato per risolvere i seguenti problemi critici durante una riconnessione (page reload):
1. **Sincronizzazione dello stato "Working"**: Il frontend deve sapere immediatamente se l'agente sta ancora lavorando in background.
2. **Coerenza dei controlli UI**: Il pulsante "Stop" e gli indicatori di caricamento devono apparire solo quando l'agente è effettivamente attivo.
3. **Ripristino della Timeline**: I messaggi e gli stati dei tool devono essere ripristinati esattamente come erano prima della disconnessione.

## 🛠️ Ispirazione: OpenCode Web UI

Abbiamo adottato i seguenti pattern architettonici da OpenCode per garantire una gestione robusta:

### 1. Session Status Store
L'uso di uno store centralizzato (Zustand) che mappa ogni `sessionId` a uno stato specifico (`idle`, `working`, `streaming`). Questo permette al frontend di gestire più sessioni contemporaneamente senza conflitti di stato.

### 2. Active Stream Detection
La logica per mostrare il pulsante "Stop" non si basa solo su un flag booleano, ma sulla combinazione di:
- Stato della sessione = `busy`/`working`.
- Ultimo messaggio dell'assistente = `non completato`.

### 3. Visibility Reporting
Il client segnala al backend quando la finestra del browser è visibile o nascosta (`report_visibility`), permettendo al server di ottimizzare l'invio di aggiornamenti o gestire il timeout delle sessioni in modo intelligente.

---

## ⚙️ Implementazione Tecnica

### Backend (`src/server.ts`)

Il backend mantiene il tracking dello stato della sessione all'interno dell'oggetto `CwdSession`:

- **State Tracking**: Vengono utilizzati `stateVersion` (per evitare race condition), `workingStartTime` (per calcolare la durata del lavoro) e `lastEventType`.
- **Event Lifecycle**: La funzione `forwardEvent` aggiorna automaticamente lo stato della sessione durante gli eventi `agent_start`, `agent_end`, `message_start` e `message_end`.
- **Handshake di Riconnessione**: Al momento del `load_session`, il server non invia solo la cronologia, ma un pacchetto di stato completo che include:
    - `isWorking`: Boolean che indica se l'agente è attivo.
    - `workingDuration`: Tempo trascorso dall'inizio dell'operazione corrente.
    - `stateVersion`: Versione corrente dello stato per sincronizzare i client.
- **Preservazione dello stato `idle`**: Quando l'ultimo client si disconnette, lo stato `idle` NON viene forzato a `true`. Questo garantisce che se l'agente sta ancora lavorando in background, lo stato corretto venga ripristino alla riconnessione.

### Frontend

Il frontend implementa la logica di ricezione e reazione a questi stati:

#### Session Status Store
Uno store Zustand (`useSessionStatusStore`) gestisce:
- `statuses`: Mappa delle sessioni e loro stato attuale (`idle`, `working`, `streaming`).
- `workingStartTime`: Timestamp per il calcolo in tempo reale della durata della lavorazione.
- **Sincronizzazione**: Lo store è l'unica fonte di verità per la proprietà `isBusy` nell'interfaccia, garantendo che lo stato di lavorazione sia persistente tra i ricaricamenti della pagina.

#### WebSocket Integration
L'hook WebSocket gestisce il ciclo di vita della connessione:
1. **Connessione**: Il frontend invia `get_available_models` e `load_session` per ripristinare lo stato.
2. **Ricezione Stato**: Il server risponde con `session_loaded`, `agent_start` (se l'agente sta lavorando), e `state` con lo stato completo.
3. **Reattività UI**: I componenti reagiscono ai cambiamenti dello store per mostrare/nascondere il pulsante Stop e gli indicatori di attività.

---

## 🔄 Flusso di Riconnessione

### Disconnessione

1. **Client WS si disconnette** → `ws.on("close")` viene invocato
2. **Il client viene rimosso** da `cr.clients`
3. **Se era l'ultimo client**: `idle` NON viene modificato — lo stato dell'agente viene preservato
4. **L'agente continua a lavorare** in background se stava processando

### Riconnessione

1. **Client WS si reconnette** → `onConnected` callback viene invocato
2. **Frontend refresha** la lista sessioni via REST API
3. **Frontend invia** `get_available_models` e `load_session` (in quest'ordine)
4. **Server risponde**:
   - `session_loaded` — conferma la sessione caricata
   - `agent_start` (se `!cr.idle`) — l'agente sta lavorando
   - `state` — stato completo con `isWorking`, `workingDuration`, `stateVersion`
   - `rpc_response` con `get_messages` — cronologia completa
5. **Frontend aggiorna** lo store Zustand con `setStatus(sessionId, 'working')`
6. **UI si aggiorna** → Il pulsante Stop appare e il timer di lavorazione riprende

### Flusso dettagliato (sequenza messaggi)

```
Client                          Server
  |                                |
  |--- WS CONNECT --------------->|
  |                                |
  |<-- session_loaded ------------|
  |<-- agent_start (if working) --|
  |<-- state (isWorking:true) -----|
  |<-- rpc_response(messages) -----|
  |                                |
  |--- report_visibility -------->|
  |--- get_state (polling 3s) --->|
  |<-- state --------------------|
```

---

## 🔑 Comportamento Critico: Preservazione `idle`

### Problema originale
Quando l'ultimo client si disconnetteva, il server forzava `cr.idle = true`. Questo causava:
- Riconnessione → `isWorking: false` anche se l'agente stava ancora lavorando
- UI mostrava "idle" invece di "working"
- Pulsante Stop non appariva

### Soluzione
Il server NON modifica `cr.idle` quando il client si disconnette. Lo stato `idle` viene modificato solo da:
- `agent_start` → `cr.idle = false`
- `agent_end` → `cr.idle = true`
- `create_session`/`new_session` → `cr.idle = true`

### Log indicative
```
🔌 Client disconnected
📡 Last client left for /home/manu/project, preserving idle=false  ← L'agente sta lavorando
```

---

## 📊 Polling di Stato

Il frontend esegue polling periodico (ogni 3 secondi) con:
- `get_state` — stato corrente della sessione
- `get_session_stats` — statistiche token e contesto

Questo garantisce sincronizzazione anche in caso di packet loss o eventi persi.

---

## 🔧 Debug

Per verificare il flusso di riconnessione:

```bash
# Vedere i log di riconnessione
journalctl -u pi-web -f | grep -E "disconnect|reconnect|load_session|state preserved|idle"

# Log specifici per session management
journalctl -u pi-web -f | grep -E "📡|preserv|same session"
```
