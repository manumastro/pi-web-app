# Deployment & Operations

## Architecture

**Pi Web** uses:
- **Backend**: Express.js server on port 3211
- **Frontend**: Static files served by Express
- **Protocol**: SSE (Server-Sent Events) + REST API
- **No reverse proxy needed**: serves directly on public IP

---

## Quick Start

### Installation
```bash
cd pi-web-app
npm run install:all    # installs backend + frontend dependencies
npm run build:ui       # builds frontend to public/
```

### Development
```bash
# Terminal 1: backend (auto-reload)
npm run dev:server

# Terminal 2: frontend (HMR on :5173)
npm run dev:ui
```

### Production
```bash
npm run build:ui    # outputs to public/
npm start           # serves on :3211
```

---

## Systemd Service

### Install
```bash
cp pi-web.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now pi-web
```

### Manage
```bash
systemctl --user status pi-web
systemctl --user restart pi-web
systemctl --user stop pi-web
journalctl --user -u pi-web -n 50 --no-pager
journalctl --user -u pi-web -f     # follow logs
```

### Service Configuration
The service unit (`~/.config/systemd/user/pi-web.service`) is configured with:
- **Node.js**: via `npx tsx`
- **Restart**: always (5s delay)
- **Graceful shutdown**: SIGTERM → 3s wait → SIGKILL
- **Pre-start**: kills anything on port 3211
- **File descriptors**: 65536

---

## Access

### Local
```
http://localhost:3211
```

### Public IP
```
http://161.97.116.63:3211
```

### Firewall
```bash
# Allow access
sudo ufw allow 3211/tcp

# Block direct access (optional - use firewall instead)
sudo ufw deny 3211/tcp
```

---

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cwds` | List all project directories |
| `GET` | `/api/sessions?cwd=` | List sessions for a CWD |
| `GET` | `/api/sessions/:id` | Get session messages |
| `POST` | `/api/sessions` | Create new session |
| `POST` | `/api/sessions/load` | Load existing session |
| `DELETE` | `/api/sessions/:id` | Delete session |
| `GET` | `/api/sessions/state?cwd=` | Get current session state |
| `GET` | `/api/sessions/stats?cwd=` | Get session stats |
| `POST` | `/api/sessions/prompt` | Send prompt |
| `POST` | `/api/sessions/steer` | Steer agent |
| `POST` | `/api/sessions/follow_up` | Follow-up message |
| `POST` | `/api/sessions/abort` | Abort current operation |

### SSE (Server-Sent Events)

```
GET /api/events?cwd=/path/to/project
```

Events stream: `server.connected`, `state`, `thinking_*`, `text_*`, `toolcall_*`, `agent_start/end`, etc.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_WEB_PORT` | `3211` | HTTP server port |
| `PI_WEB_AUTH_TOKEN` | *(empty)* | Auth token (empty = no auth) |
| `PI_WEB_IDLE_TIMEOUT_MS` | `0` | Kill idle processes after N ms (0 = disabled) |
| `PI_WEB_CWD` | `$HOME` | Default working directory |

---

## Session Management

### View Sessions via API
```bash
# List all sessions
curl http://localhost:3211/api/sessions | jq

# Sessions for specific CWD
curl 'http://localhost:3211/api/sessions?cwd=/home/manu/pi-web-app' | jq

# List working directories
curl http://localhost:3211/api/cwds | jq
```

### Delete a Session
```bash
curl -X DELETE http://localhost:3211/api/sessions/<session-id>
```

### Session File Location
```
~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl
```

### Clean Old Sessions
```bash
# Find sessions older than 30 days
find ~/.pi/agent/sessions -name "*.jsonl" -mtime +30 -delete
```

---

## Monitoring

### Health Check
```bash
curl http://localhost:3211/api/cwds
# Expected: [{ "path": "...", "label": "~", "sessionCount": N }]
```

### View Server Logs
The UI includes a real-time log viewer (toggle via the 📋 button in the header).

```bash
journalctl --user -u pi-web -f           # live tail
journalctl --user -u pi-web -n 200       # last 200 lines
journalctl --user -u pi-web --since "1 hour ago"
```

---

## Troubleshooting

### Server Won't Start
```bash
# Check if port is in use
ss -tlnp | grep 3211
lsof -i :3211

# Kill existing process
fuser -k 3211/tcp

# Check service status
systemctl --user status pi-web
journalctl --user -u pi-web -n 100 --no-pager
```

### Frontend Shows Blank Page
```bash
# Check if build assets exist
ls -la public/assets/

# Rebuild
cd frontend && npm run build
```

### API Returns 404
```bash
# Check server is running
curl http://localhost:3211/api/cwds

# Check server logs
journalctl --user -u pi-web --since "5 minutes ago"
```

### Session Not Loading
```bash
# Verify session file exists
ls ~/.pi/agent/sessions/--home-manu-pi-web-app--/

# Check server logs for errors
journalctl --user -u pi-web --since "5 minutes ago"
```

---

## Updating

```bash
cd /home/manu/pi-web-app
git pull

# Install new dependencies
npm run install:all

# Rebuild frontend
npm run build:ui

# Restart service
systemctl --user restart pi-web
```

---

## Model Management

### Regenerate Model List
```bash
cd /home/manu/pi-web-app
node -e "
  import { ModelRegistry, AuthStorage } from '@mariozechner/pi-coding-agent';
  import fs from 'fs';
  const r = ModelRegistry.create(AuthStorage.create(), '/home/manu/.pi/agent');
  const m = await r.getAvailable();
  fs.writeFileSync('models.json', JSON.stringify(m, null, 2));
"
```

### Qwen OAuth Accounts
Additional accounts in `~/.pi/agent/qwen-oauth-profiles.json`:
```json
{
  "accounts": [
    { "provider": "qwen-oauth-account2", "label": "Work Account" }
  ]
}
```

### Provider API Keys
Some providers require environment variables:
```bash
# Edit service
systemctl --user edit pi-web
# Add environment variables
Environment=OPENCODE_API_KEY=your-key

systemctl --user daemon-reload
systemctl --user restart pi-web
```

---

## Extensions

Extensions are loaded from:
1. **Base**: `pi-agent-browser` (always loaded)
2. **Packages**: entries in `~/.pi/agent/settings.json` → `packages` array

Install extensions:
```bash
pi install pi-qwen-oauth
pi install pi-agent-browser
```
