# 🥧 Pi Web — AI Coding Agent nel Browser

Interfaccia web completa per **pi-coding-agent** — usa il SDK direttamente in-process (nessun subprocess).

## 🌐 Accesso

| | URL |
|---|---|
| **Locale** | `http://localhost:3210` |
| **Pubblico** | `http://<VPS-IP>:3210` |

## ✅ Features

- **SDK in-process** — usa `createAgentSession` dal SDK pi, zero overhead subprocess
- **Multi-client** — più tab/browser condividono la stessa sessione
- **Auth opzionale** — token per proteggere l'accesso WebSocket
- **Idle timeout** — processi pi uccisi automaticamente quando inutilizzati
- **Navigazione sessioni** — click per caricare qualsiasi sessione passata
- **Chat live** — messaggi e risposte in streaming
- **Thinking blocks** — chain-of-thought collassabile
- **Tool execution** — tool call e tool exec in tempo reale
- **Cambio directory** — selettore per filtrare per progetto
- **Model selector** — ricerca testuale + raggruppamento per provider (88+ modelli)
- **Dark mode** — interfaccia ottimizzata per coding
- **Responsive** — sidebar collassabile su mobile
- **Abort** — interrompere l'agent
- **Auto-retry** — retry automatici su errori transienti
- **Compaction** — compattazione context manuale e automatica

## 🚀 Avvio

### Installazione

```bash
cd pi-web-app

# Backend + frontend
npm run install:all

# Build frontend
npm run build:ui
```

### Modalità sviluppo

```bash
# Terminale 1: server backend
npm run dev:server

# Terminale 2: frontend React con HMR
npm run dev:ui
# → http://localhost:5173 (proxy API verso :3210)
```

### Produzione

```bash
# Build frontend → public/
npm run build:ui

# Avvia server (serve il frontend buildato)
npm start
```

## 🔧 Servizio systemd

```bash
sudo cp pi-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pi-web
sudo systemctl status pi-web
sudo systemctl restart pi-web
sudo journalctl -u pi-web -n 50 --no-pager
```

## 🔒 Sicurezza

### Auth Token (consigliato per accesso pubblico)
```bash
# Genera un token
export PI_WEB_AUTH_TOKEN=$(openssl rand -hex 32)

# Avvia con auth
PI_WEB_AUTH_TOKEN=your-secret npm start

# Nel browser, connetti con:
# ws://host:3210?token=your-secret
```

### Firewall
```bash
# Blocca accesso diretto alla porta 3210
sudo ufw deny 3210/tcp
# Oppure limita a IP specifici
sudo ufw allow 3210/tcp from TUO_IP
```

### Idle Timeout
```bash
# Uccide processi pi dopo 5 min senza client connessi
PI_WEB_IDLE_TIMEOUT_MS=300000 npm start
```

## 📁 Struttura

```
pi-web-app/
├── src/server.ts          # Express + WebSocket → bridge SDK in-process
├── frontend/              # Frontend React + Vite + Tailwind
│   ├── src/
│   │   ├── App.tsx        # App principale
│   │   ├── components/    # Chat, Sidebar, Header, InputArea
│   │   ├── hooks/         # useWebSocket
│   │   └── types.ts       # Tipi TypeScript
│   ├── vite.config.ts
│   └── package.json
├── public/                # Frontend buildato (output di vite build)
├── models.json            # Lista modelli da pi --list-models (88+ modelli)
├── package.json
├── pi-web.service         # Unit systemd
└── README.md
```

## 🏗️ Architettura

Il server usa il **SDK pi direttamente in-process** tramite `createAgentSession`.

```
┌──────────────────────────────────────────┐
│              Browser (React)              │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ │
│  │ Sidebar  │ │  Chat    │ │  Input    │ │
│  │ Sessions │ │ Messages │ │  Images   │ │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ │
└───────┼────────────┼─────────────┼────────┘
        │  WebSocket │             │
        └────────────┼─────────────┘
                     │
┌────────────────────┼──────────────────────┐
│         Express Server (SDK bridge)        │
│  ┌─────────────────┼────────────────────┐ │
│  │  WS Handler     │  REST API          │ │
│  │  Multi-client   │  GET /sessions     │ │
│  │  Auth token     │  GET /sessions/:id │ │
│  │  Idle timeout   │  GET /cwds         │ │
│  └────────┬────────┴────────────────────┘ │
│           │  createAgentSession()         │
│  ┌────────┴────────────────────────────┐  │
│  │  @mariozechner/pi-coding-agent SDK  │  │
│  │  (stesso codice della CLI, in-proc) │  │
│  │                                     │  │
│  │  Auth:  ~/.pi/agent/auth.json       │  │
│  │  Model: ~/.pi/agent/settings.json   │  │
│  │  Estensioni: pi-qwen-oauth          │  │
│  │  Skills, Context files              │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

## 🤖 Estensioni

Le estensioni pi vengono caricate tramite il SDK:

```bash
# Installa estensioni
pi install pi-qwen-oauth

# Lista estensioni installate
pi list
```

I modelli disponibili vengono caricati da `models.json` (generato da `pi --list-models`).

## ⚙️ Variabili d'ambiente

| Variabile | Default | Descrizione |
|---|---|---|
| `PI_WEB_PORT` | `3210` | Porta del server web |
| `PI_WEB_AUTH_TOKEN` | *(vuoto)* | Token per autenticazione WebSocket |
| `PI_WEB_IDLE_TIMEOUT_MS` | `0` | Timeout idle processi pi (0 = disabled) |
| `PI_WEB_CWD` | `$HOME` | Directory di lavoro default |
| `OPENCODE_API_KEY` | *(vuoto)* | API key per provider opencode/opencode-go |

Vedi `pi-web.service` per la configurazione systemd.

> **Nota:** Alcuni provider (es. `opencode`, `minimax`) usano variabili d'ambiente invece di `auth.json`.
> Assicurati che siano configurate nel servizio systemd (es. `Environment=OPENCODE_API_KEY=...`).
> Senza di esse, la selezione del modello fallirà con "No API key for provider/model".

## 📡 Protocollo WebSocket

Tutti i comandi accettano `cwd` opzionale (default: HOME).

### Client → Server
```json
{ "type": "prompt", "text": "message", "cwd": "/path" }
{ "type": "steer", "text": "modifica", "cwd": "/path" }
{ "type": "follow_up", "text": "dopo", "cwd": "/path" }
{ "type": "abort" }
{ "type": "new_session", "cwd": "/path" }
{ "type": "load_session", "cwd": "/path", "sessionId": "uuid" }
{ "type": "set_model", "provider": "anthropic", "modelId": "claude-sonnet-4", "cwd": "/path" }
{ "type": "cycle_model", "cwd": "/path" }
{ "type": "get_available_models", "cwd": "/path" }
{ "type": "compact", "customInstructions": "...", "cwd": "/path" }
```

### Server → Client
Streaming: `thinking_start/delta/end`, `text_start/delta/end`, `toolcall_start/delta/end`
Tool exec: `tool_exec_start/update/end`
Lifecycle: `agent_start/end`, `done`, `compaction_start/end`
Info: `model_info`, `queue_update`, `rpc_response`, `rpc_error`, `error`

## 🆕 Changelog

### 2026-04-12
- **Fix:** `set_model` ora gestisce correttamente errori e rejection (no più "Unhandled rejection: {}")
- **Fix:** se non esiste una sessione attiva, ne crea una per impostare il modello
- **Fix:** errori `set_model` mostrati come feedback visibile nella chat
- **Fix:** aggiunto `try/catch` su `cycle_model`, `set_thinking_level`, `cycle_thinking_level`
- **Config:** aggiunto `OPENCODE_API_KEY` al servizio systemd per provider opencode

## 🛠️ Troubleshooting

```bash
# Server attivo?
curl http://localhost:3210/api/cwds

# Log
sudo journalctl -u pi-web -n 50 --no-pager

# Restart
sudo systemctl restart pi-web

# Rigenera lista modelli
cd /home/manu/pi-web-app
node --experimental-strip-types -e "
  import { ModelRegistry, AuthStorage } from '@mariozechner/pi-coding-agent';
  import fs from 'fs';
  const r = ModelRegistry.create(AuthStorage.create(), '/home/manu/.pi/agent');
  const m = await r.getAvailable();
  fs.writeFileSync('models.json', JSON.stringify(m, null, 2));
"

# Rebuild frontend
cd frontend && npm run build

# Errore "No API key for provider/model"?
# Controlla che le variabili d'ambiente del provider siano nel servizio systemd:
sudo systemctl show pi-web -p Environment | grep API_KEY
# Oppure aggiungi la variabile mancante in /etc/systemd/system/pi-web.service
# e riavvia: sudo systemctl daemon-reload && sudo systemctl restart pi-web
```
