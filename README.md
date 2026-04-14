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
# Start service: systemctl --user start pi-web
# → http://localhost:3210
```

## 📚 Documentazione

La documentazione completa è nella cartella [`docs/`](docs/):

| Documento | Descrizione |
|-----------|-------------|
| [📖 Panoramica](docs/ARCHITECTURE.md) | Architettura generale, tech stack |
| [📡 Protocollo SSE+REST](docs/WEBSOCKET_PROTOCOL.md) | Reference completa API (SSE + REST) |
| [🔄 Session Management](docs/SESSION_MANAGEMENT.md) | State & reconnection |
| [🔍 OpenCode Analysis](docs/OPENCODE_ANALYSIS.md) | Analisi comparativa con OpenCode |
| [📋 Refactoring Plan](docs/REFACTORING_PLAN.md) | Piano completato: WS → SSE |
| [🎨 Frontend](docs/FRONTEND.md) | Componenti React, state management |
| [⚙️ Backend](docs/BACKEND.md) | Server internals, SDK integration |
| [🚀 Deployment](docs/DEPLOYMENT.md) | Installazione, systemd, nginx |

## ✅ Features

- **SDK in-process** — zero overhead subprocess
- **Protocollo SSE** — Server-Sent Events + REST (sostituito WebSocket)
- **Multi-client** — più tab condividono la sessione
- **Streaming real-time** — text, thinking, tool call, tool execution
- **Session management** — crea, carica, elimina, fork sessioni
- **Model switching** — 88+ modelli, ricerca e raggruppamento per provider
- **Image support** — paste o upload immagini nei prompt
- **Steer / Follow-up / Abort** — controlli completi sull'agent
- **Compaction** — manuale e automatica
- **Retry UI** — banner countdown per errori e retry
- **Dark mode + responsive** — ottimizzato per coding