# 🥧 Pi Web — AI Coding Agent nel Browser

Interfaccia web completa per **pi-coding-agent** — usa il SDK direttamente in-process (nessun subprocess).

## 🌐 Accesso

| | URL |
|---|---|
| **Locale** | `http://localhost:3211` |
| **Pubblico** | `http://161.97.116.63:3211` |

## 🚀 Quick Start

```bash
cd pi-web-app
npm run install:all
npm run build:ui
# Start service: systemctl --user start pi-web
# → http://localhost:3211
```

## 📚 Documentazione

| Documento | Descrizione |
|-----------|-------------|
| [📖 Indice Docs](docs/README.md) | Navigazione completa documentazione |
| [📊 STATUS](docs/STATUS.md) | Stato attuale, cosa funziona |
| [🏗️ Architettura](docs/ARCHITECTURE.md) | Tech stack, data flow |
| [🔄 Session Management](docs/SESSION_MANAGEMENT.md) | State & reconnection |
| [🎨 Frontend](docs/FRONTEND.md) | Componenti React, state management |
| [⚙️ Backend](docs/BACKEND.md) | Server internals, SDK integration |
| [🚀 Deployment](docs/DEPLOYMENT.md) | Installazione, systemd |
| [📈 Migliorie](docs/IMPLEMENTED_IMPROVEMENTS.md) | Event pipeline, deduplicazione |
| [🧪 Testing](docs/TESTING_ROADMAP.md) | Roadmap testing e2e |

## ✅ Features

- **SDK in-process** — zero overhead subprocess
- **Protocollo SSE+REST** — Server-Sent Events + REST API
- **Multi-client** — più tab condividono la sessione
- **Streaming real-time** — text, thinking, tool call, tool execution
- **Session management** — crea, carica, elimina, fork sessioni
- **Model switching** — 88+ modelli, ricerca e raggruppamento per provider
- **Image support** — paste o upload immagini nei prompt
- **Steer / Follow-up / Abort** — controlli completi sull'agent
- **Dark mode + responsive** — ottimizzato per coding

## 🔧 Stack Tecnico

- **Backend**: Express.js + Node.js
- **Frontend**: React 19 + Vite 6 + Tailwind CSS 4
- **Protocol**: SSE + REST (sostituito WebSocket)
- **Process Manager**: systemd
