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
| [📖 Panoramica](docs/ARCHITECTURE.md) | Architettura, tech stack |
| [📡 API Reference](docs/ARCHITECTURE.md#api-reference) | Endpoints SSE + REST |
| [🔄 Session Management](docs/SESSION_MANAGEMENT.md) | State & reconnection |
| [📋 Refactoring Plan](docs/REFACTORING_PLAN.md) | Piano completato: WS → SSE |
| [🎨 Frontend](docs/FRONTEND.md) | Componenti React, state management |
| [⚙️ Backend](docs/BACKEND.md) | Server internals, SDK integration |
| [🚀 Deployment](docs/DEPLOYMENT.md) | Installazione, systemd |

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
