# Pi Web — Documentation Index

> **Server**: systemd service `pi-web` in `/etc/systemd/system/pi-web.service` (porta 3210)

## 📚 All Documentation

| Document | Path | Description |
|----------|------|-------------|
| [📖 Index](docs/README.md) | `docs/README.md` | **Start here** — navigazione docs |
| [📊 STATUS](docs/STATUS.md) | `docs/STATUS.md` | Current status, what's working |
| [🏗️ Architecture](docs/ARCHITECTURE.md) | `docs/ARCHITECTURE.md` | Design decisions, data flow, tech stack |
| [🔄 Session Management](docs/SESSION_MANAGEMENT.md) | `docs/SESSION_MANAGEMENT.md` | State & reconnection |
| [🎨 Frontend](docs/FRONTEND.md) | `docs/FRONTEND.md` | React components, state, rendering |
| [⚙️ Backend](docs/BACKEND.md) | `docs/BACKEND.md` | Server internals, SDK integration |
| [🚀 Deployment](docs/DEPLOYMENT.md) | `docs/DEPLOYMENT.md` | Install, systemd, nginx, ops |
| [📈 Improvements](docs/IMPLEMENTED_IMPROVEMENTS.md) | `docs/IMPLEMENTED_IMPROVEMENTS.md) | Event pipeline, deduplication |
| [🧪 Testing Roadmap](docs/TESTING_ROADMAP.md) | `docs/TESTING_ROADMAP.md) | End-to-end testing guide |

## 🔑 Key Changes

### Protocol: SSE + REST (NOT WebSocket)
The old WebSocket protocol has been replaced with **SSE + REST** for better compatibility and simplicity.

```
Client ← SSE (streaming: text, thinking, tool calls)
Client → REST (commands: send message, abort, switch model)
```

### Docs Removed
- `WEBSOCKET_PROTOCOL.md` — obsolete, superseded by SSE+REST
- `OPENCHAMBER_ANALYSIS.md` — research only
- `OPENCODE_ANALYSIS.md` — research only
- `REFACTORING_PLAN.md` — completed
