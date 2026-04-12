# Deployment & Operations

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
# → http://localhost:5173 (proxies API to :3210)
```

### Production
```bash
npm run build:ui    # outputs to public/
npm start           # serves on :3210
```

---

## Systemd Service

### Install
```bash
sudo cp pi-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pi-web
```

### Manage
```bash
sudo systemctl status pi-web
sudo systemctl restart pi-web
sudo systemctl stop pi-web
sudo journalctl -u pi-web -n 50 --no-pager
sudo journalctl -u pi-web -f     # follow logs
```

### Service Configuration
The service unit (`pi-web.service`) is configured with:
- **User**: `manu`
- **Node.js**: `/home/manu/.nvm/versions/node/v24.12.0/bin/node`
- **Restart**: always (5s delay)
- **Graceful shutdown**: SIGTERM → 3s wait → SIGKILL
- **Pre-start**: kills anything on port 3210
- **File descriptors**: 65536
- **Writable paths**: `~/.pi/agent`, `$HOME`, `/tmp`, project dir

---

## Reverse Proxy (Nginx)

For production use behind a domain name, use nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name pi.example.com;

    # WebSocket upgrade
    location / {
        proxy_pass http://127.0.0.1:3210;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;  # keep WS connections alive
    }
}
```

With Let's Encrypt:
```bash
sudo certbot --nginx -d pi.example.com
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_WEB_PORT` | `3210` | HTTP/WS server port |
| `PI_WEB_AUTH_TOKEN` | *(empty)* | WebSocket auth token (empty = no auth) |
| `PI_WEB_IDLE_TIMEOUT_MS` | `0` | Kill idle pi processes after N ms (0 = disabled) |
| `PI_WEB_CWD` | `$HOME` | Default working directory |

Provider-specific variables (configured in systemd service):
| Variable | Description |
|----------|-------------|
| `OPENCODE_API_KEY` | API key for opencode/opencode-go providers |

> **Note:** Some providers use environment variables instead of `auth.json`. Without them, model selection fails with "No API key for provider/model".

---

## Authentication

### Enable WebSocket Token Auth
```bash
# Generate a secure token
export PI_WEB_AUTH_TOKEN=$(openssl rand -hex 32)

# Persist in systemd
sudo systemctl edit pi-web
# Add:
# [Service]
# Environment=PI_WEB_AUTH_TOKEN=your-generated-token-here

sudo systemctl daemon-reload
sudo systemctl restart pi-web
```

### Connect with Token
In the browser, the frontend automatically appends the token if `VITE_AUTH_TOKEN` is set in the frontend `.env`:
```
VITE_AUTH_TOKEN=your-generated-token-here
```

### Firewall
```bash
# Block direct access (use nginx proxy instead)
sudo ufw deny 3210/tcp

# Or limit to specific IPs
sudo ufw allow 3210/tcp from YOUR_IP
```

---

## Model Management

### Regenerate Model List
```bash
cd /home/manu/pi-web-app
node --experimental-strip-types -e "
  import { ModelRegistry, AuthStorage } from '@mariozechner/pi-coding-agent';
  import fs from 'fs';
  const r = ModelRegistry.create(AuthStorage.create(), '/home/manu/.pi/agent');
  const m = await r.getAvailable();
  fs.writeFileSync('models.json', JSON.stringify(m, null, 2));
"
```

### Available Models
The server merges models from three sources:
1. **SDK registry** — `modelRegistry.getAvailable()`
2. **CLI output** — `models.json` (fallback)
3. **Custom models** — qwen-oauth accounts from `qwen-oauth-profiles.json`

### Qwen OAuth Accounts
Additional accounts are configured in `~/.pi/agent/qwen-oauth-profiles.json`:
```json
{
  "accounts": [
    { "provider": "qwen-oauth-account2", "label": "Work Account" }
  ]
}
```

Login to each account:
```bash
pi login qwen-oauth
pi login qwen-oauth-account2
```

---

## Extensions

### Install Extensions
```bash
pi install pi-qwen-oauth
pi install pi-agent-browser
# etc.
```

### List Installed
```bash
pi list
```

Extensions are loaded from:
1. **Base**: `pi-agent-browser` (hardcoded)
2. **Packages**: entries in `settings.json` → `packages` array

---

## Session Management

### View Sessions via API
```bash
# List all sessions
curl http://localhost:3210/api/sessions | jq

# Sessions for specific CWD
curl 'http://localhost:3210/api/sessions?cwd=/home/manu/pi-web-app' | jq

# Full message history for a session
curl http://localhost:3210/api/sessions/5a456370-... | jq

# List working directories
curl http://localhost:3210/api/cwds | jq
```

### Delete a Session
```bash
curl -X DELETE http://localhost:3210/api/sessions/5a456370-...
```

Or via the UI: hover over a session in the sidebar and click the trash icon.

### Session File Location
```
~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl
```

Encoding examples:
```
/home/manu              → --home-manu--
/home/manu/my-project   → --home-manu-my-project--
```

### Clean Old Sessions
```bash
# Find sessions older than 30 days
find ~/.pi/agent/sessions -name "*.jsonl" -mtime +30 -delete

# Or by size
du -sh ~/.pi/agent/sessions/*
```

---

## Monitoring

### Health Check
```bash
curl http://localhost:3210/api/cwds
# Expected: [{ "path": "...", "label": "~", "sessionCount": N }]
```

### View Server Logs
The UI includes a real-time log viewer (toggle via the 📋 button in the header). Logs are also available via:

```bash
sudo journalctl -u pi-web -f           # live tail
sudo journalctl -u pi-web -n 200       # last 200 lines
sudo journalctl -u pi-web --since "1 hour ago"
```

### Check Memory Usage
```bash
# Node.js process memory
ps aux | grep server.ts

# Or via /proc
cat /proc/$(pgrep -f server.ts)/status | grep VmRSS
```

### WebSocket Connections
```bash
# Count active WS connections
ss -tnp | grep 3210 | grep ESTAB | wc -l
```

---

## Troubleshooting

### Server Won't Start
```bash
# Check if port is in use
ss -tlnp | grep 3210
lsof -i :3210

# Kill existing process
fuser -k 3210/tcp

# Check service status
sudo systemctl status pi-web
sudo journalctl -u pi-web -n 100 --no-pager
```

### "No API Key for Provider/Model"
```bash
# Check configured env vars
sudo systemctl show pi-web -p Environment | grep API_KEY

# For opencode providers, ensure OPENCODE_API_KEY is set
sudo systemctl edit pi-web
# Add: Environment=OPENCODE_API_KEY=your-key
sudo systemctl daemon-reload && sudo systemctl restart pi-web

# For qwen-oauth, check auth.json
cat ~/.pi/agent/auth.json | jq
```

### Frontend Shows Blank Page
```bash
# Check if build assets exist
ls -la public/assets/

# Rebuild
cd frontend && npm run build

# Check nginx config (if using reverse proxy)
sudo nginx -t
sudo systemctl status nginx
```

### WebSocket Disconnects Frequently
```bash
# Check nginx proxy_read_timeout
grep proxy_read_timeout /etc/nginx/sites-enabled/*

# Should be at least 86400 (24 hours)
# If too low, WS connections drop after timeout
```

### Session Not Loading
```bash
# Verify session file exists
ls ~/.pi/agent/sessions/--home-manu-pi-web-app--/

# Check file is valid JSONL
head -5 ~/.pi/agent/sessions/--home-manu-pi-web-app--/*.jsonl | jq

# Check server logs for errors
sudo journalctl -u pi-web --since "5 minutes ago"
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
sudo systemctl restart pi-web
```
