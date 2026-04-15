# 📚 Pi Web — Documentazione

## 🗂️ Indice Documenti

### Core Docs (Lettura Consigliata)
| Documento | Descrizione |
|-----------|-------------|
| [STATUS.md](STATUS.md) | 📊 Stato attuale del progetto, cosa funziona |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 🏗️ Architettura sistema, tech stack, data flow |

### Implementazione
| Documento | Descrizione |
|-----------|-------------|
| [FRONTEND.md](FRONTEND.md) | 🎨 Componenti React, state management, rendering |
| [BACKEND.md](BACKEND.md) | ⚙️ Server internals, SDK integration |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 🚀 Installazione, systemd, nginx |

### Gestione & Testing
| Documento | Descrizione |
|-----------|-------------|
| [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) | 🔄 State & reconnection |
| [TESTING_ROADMAP.md](TESTING_ROADMAP.md) | 🧪 Roadmap testing end-to-end |
| [IMPLEMENTED_IMPROVEMENTS.md](IMPLEMENTED_IMPROVEMENTS.md) | 📈 Event pipeline, deduplicazione |

---

## 🔑 Protocollo: SSE + REST

Il vecchio protocollo WebSocket è stato sostituito con **SSE + REST**:

```
Client ← SSE (streaming text, thinking, tools)
Client → REST (send message, abort, switch model, etc.)
```

## 📁 Struttura Progetto

```
pi-web-app/
├── docs/             # Documentazione
├── backend/          # Backend Express
├── frontend/          # React UI
├── public/           # Static assets
└── src/
    └── server.ts     # Entry point
```
