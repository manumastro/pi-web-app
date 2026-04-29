#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://piwebapp.duckdns.org}"
CWD_PATH="${CWD_PATH:-/home/manu/pi-web-app}"
MODEL_KEY="${MODEL_KEY:-openai-codex/gpt-5.3-codex}"
PROMPT_TEXT="${PROMPT_TEXT:-Rispondi solo: SSE_OK}"

need() { command -v "$1" >/dev/null || { echo "missing command: $1" >&2; exit 1; }; }
need curl
need python3

json_get() {
  python3 - "$1" "$2" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
path=sys.argv[2].split('.')
cur=payload
for p in path:
    cur=cur[p]
print(cur)
PY
}

echo "[1/7] health"
curl -sf "$BASE_URL/health" >/dev/null

echo "[2/7] create session"
CREATE=$(curl -sf -X POST "$BASE_URL/api/sessions" -H 'Content-Type: application/json' --data "{\"cwd\":\"$CWD_PATH\",\"title\":\"e2e-sse-local\"}")
SID=$(json_get "$CREATE" "session.id")
echo "sessionId=$SID"

SSE_LOG=$(mktemp)
echo "[3/7] open SSE stream"
(curl -sfN --http1.1 "$BASE_URL/api/events?sessionId=$SID" > "$SSE_LOG") &
SSE_PID=$!
trap 'kill "$SSE_PID" >/dev/null 2>&1 || true' EXIT
sleep 1

echo "[4/7] model switch"
curl -sf -X PUT "$BASE_URL/api/models/session/model" -H 'Content-Type: application/json' --data "{\"sessionId\":\"$SID\",\"modelId\":\"$MODEL_KEY\"}" >/dev/null

echo "[5/7] send prompt"
curl -sf -X POST "$BASE_URL/api/messages/prompt" -H 'Content-Type: application/json' --data "{\"sessionId\":\"$SID\",\"message\":\"$PROMPT_TEXT\"}" >/dev/null

sleep 4
kill "$SSE_PID" >/dev/null 2>&1 || true
wait "$SSE_PID" 2>/dev/null || true

echo "[6/7] validate SSE events"
python3 - "$SSE_LOG" <<'PY'
import json,sys
p=sys.argv[1]
types=[]
with open(p,'r',encoding='utf-8',errors='ignore') as f:
    for line in f:
        if line.startswith('data: '):
            try:
                evt=json.loads(line[6:])
            except Exception:
                continue
            t=evt.get('type')
            if t:
                types.append(t)
print('event_types=',types)
for required in ('status','text_chunk','done'):
    if required not in types:
        raise SystemExit(f'missing SSE event type: {required}')
PY

echo "[7/7] validate final session"
SESSION=$(curl -sf "$BASE_URL/api/sessions/$SID")
python3 - "$SESSION" <<'PY'
import json,sys
s=json.loads(sys.argv[1])['session']
msgs=s.get('messages',[])
if not msgs:
    raise SystemExit('no messages')
last=msgs[-1]
print('status=',s.get('status'))
print('last_role=',last.get('role'))
print('last_content=',(last.get('content') or '')[:120])
if s.get('status')!='idle':
    raise SystemExit('session not idle')
if last.get('role')!='assistant':
    raise SystemExit('last message not assistant')
PY

echo "OK: SSE E2E passed"
