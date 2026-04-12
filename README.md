# 🥧 Pi Web — AI Coding Agent nel Browser

Interfaccia web completa per **pi-coding-agent** — usa il SDK direttamente in-process (nessun subprocess).

## 🌐 Accesso

| | URL |
|---|---|
| **Locale** | `http://localhost:3210` |
| **Pubblico** | `http://<VPS-IP>:3210` |

## 🚀 Quick Start

```bash
cd pi-web-app
npm run install:all
npm run build:ui
npm start
# → http://localhost:3210
```

## 📚 Documentazione

La documentazione completa è nella cartella [`docs/`](docs/):

| Documento | Descrizione |
|-----------|-------------|
| [📖 Panoramica](docs/README.md) | Indice generale, feature summary, architettura |
| [🏗️ Architettura](docs/ARCHITECTURE.md) | Design decisions, data flow, format sessioni, tech stack |
| [📡 Protocollo WebSocket](docs/WEBSOCKET_PROTOCOL.md) | Reference completa di tutti gli eventi e comandi WS |
| [🎨 Frontend](docs/FRONTEND.md) | Componenti React, state management, rendering pipeline |
| [⚙️ Backend](docs/BACKEND.md) | Server internals, SDK integration, session management |
| [🚀 Deployment](docs/DEPLOYMENT.md) | Installazione, systemd, nginx, monitoring, troubleshooting |

## ✅ Features

- **SDK in-process** — zero overhead subprocess
- **Multi-client** — più tab condividono la sessione
- **Streaming real-time** — text, thinking, tool call, tool execution
- **Session management** — crea, carica, elimina, fork sessioni
- **Model switching** — 88+ modelli, ricerca e raggruppamento per provider
- **Image support** — paste o upload immagini nei prompt
- **Steer / Follow-up / Abort** — controlli completi sull'agent
- **Compaction** — manuale e automatica
- **Dark mode + responsive** — ottimizzato per coding
