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

- **State Tracking**: Vengono utilizzati `stateVersion` (per evitare race condition), `workingStartTime` (per calcolare la durata del lavoro) e `lastMessageType`.
- **Event Lifecycle**: La funzione `forwardEvent` aggiorna automaticamente lo stato della sessione durante gli eventi `agent_start`, `agent_end`, `message_start` e `message_end`.
- **Handshake di Riconnessione**: Al momento del `load_session`, il server non invia solo la cronologia, ma un pacchetto di stato completo che include:
    - `isWorking`: Boolean che indica se l'agente è attivo.
    - `workingDuration`: Tempo trascorso dall'inizio dell'operazione corrente.
    - `stateVersion`: Versione corrente dello stato per sincronizzare i client.

### Frontend

Il frontend implementa la logica di ricezione e reazione a questi stati:

#### Session Status Store
Uno store Zustand (`useSessionStatusStore`) gestisce:
- `statuses`: Mappa delle sessioni e loro stato attuale (`idle`, `working`, `streaming`).
- `workingStartTime`: Timestamp per il calcolo in tempo reale della durata della lavorazione.
- **Sincronizzazione**: Lo store è l'unica fonte di verità per la proprietà `isBusy` nell'interfaccia, garantendo che lo stato di lavorazione sia persistente tra i ricaricamenti della pagina.

#### WebSocket Integration
L'hook WebSocket gestisce il ciclo di vita della connessione:
1. **Connessione**: Invia immediatamente un evento `report_visibility` per informare il server della presenza del client.
2. **Ricezione Stato**: Ascolta gli eventi di stato dal server per aggiornare lo store Zustand.
3. **Reattività UI**: I componenti (come l'input area e il thread dei messaggi) reagiscono ai cambiamenti dello store per mostrare/nascondere il pulsante Stop e gli indicatori di attività.

## 🔄 Flusso di Reconnection

1. **Client SSE/WS si connette** $\rightarrow$ Invia `report_visibility`.
2. **Server identifica la sessione** $\rightarrow$ Invia `session_loaded` $\rightarrow$ Invia `agent_start` (se attivo) $\rightarrow$ Invia `state` (con `isWorking` e `stateVersion`).
3. **Client aggiorna lo Store** $\rightarrow$ Zustand riceve lo stato `working`.
4. **UI si aggiorna** $\rightarrow$ Il pulsante Stop appare e il timer di lavorazione riprende a scorrere.
