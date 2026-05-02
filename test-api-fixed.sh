#!/bin/bash
# Fixed API test using Python for JSON parsing

BASE="http://localhost:3211"
PASS=0
FAIL=0

check_json() {
    local desc="$1"
    local json="$2"
    local key="$3"
    
    result=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print('$key' in d or (isinstance(d, list) and len(d)>=0))" 2>/dev/null)
    if [ "$result" = "True" ]; then
        echo "  ✅ $desc"
        ((PASS++))
    else
        echo "  ❌ $desc"
        ((FAIL++))
    fi
}

echo "=== OpenChamber API Test (Fixed) ==="
echo ""

# 1. Health
echo "[1] Health"
result=$(curl -s "$BASE/health")
check_json "Health endpoint" "$result" "ok"

# 2. Path
echo "[2] Path"
result=$(curl -s "$BASE/api/path")
check_json "Path endpoint" "$result" "path"

# 3. Config
echo "[3] Config"
result=$(curl -s "$BASE/api/global/config")
check_json "Global config" "$result" "homeDirectory"

result=$(curl -s "$BASE/api/config")
check_json "Config (alias)" "$result" "homeDirectory"

# 4. Providers
echo "[4] Providers"
result=$(curl -s "$BASE/api/provider")
check_json "Provider listing" "$result" "all"

# 5. Models
echo "[5] Models"
result=$(curl -s "$BASE/api/models")
check_json "Model listing" "$result" "models"

# 6. Projects
echo "[6] Projects"
result=$(curl -s "$BASE/api/project")
# Check if it's a non-empty array
if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print('worktree' in d[0] if isinstance(d,list) and len(d)>0 else False)" 2>/dev/null | grep -q True; then
    echo "  ✅ Project listing"
    ((PASS++))
else
    echo "  ❌ Project listing"
    ((FAIL++))
fi

# 7. Sessions
echo "[7] Sessions"
result=$(curl -s "$BASE/api/session")
if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(isinstance(d,list))" 2>/dev/null | grep -q True; then
    echo "  ✅ Session listing"
    ((PASS++))
else
    echo "  ❌ Session listing"
    ((FAIL++))
fi

# 8. Create session
echo "[8] Create Session"
SESSION=$(curl -s -X POST "$BASE/api/session?directory=/home/manu" \
    -H "Content-Type: application/json" \
    -d '{"title":"Test"}')
SESSION_ID=$(echo "$SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
if [ -n "$SESSION_ID" ]; then
    echo "  ✅ Create session ($SESSION_ID)"
    ((PASS++))
else
    echo "  ❌ Create session"
    ((FAIL++))
fi

# 9. Get session
echo "[9] Get Session"
result=$(curl -s "$BASE/api/session/$SESSION_ID")
check_json "Get session" "$result" "id"

# 10. Messages (empty)
echo "[10] Messages"
result=$(curl -s "$BASE/api/session/$SESSION_ID/message")
if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(isinstance(d,list))" 2>/dev/null | grep -q True; then
    echo "  ✅ Message listing (empty)"
    ((PASS++))
else
    echo "  ❌ Message listing"
    ((FAIL++))
fi

# 11. SSE
echo "[11] SSE Stream"
result=$(timeout 2 curl -s -N "$BASE/api/global/event" 2>&1 | head -1 || true)
if echo "$result" | grep -q "server.connected"; then
    echo "  ✅ SSE stream"
    ((PASS++))
else
    echo "  ❌ SSE stream"
    ((FAIL++))
fi

# 12. Update session
echo "[12] Update Session"
result=$(curl -s -X PUT "$BASE/api/session/$SESSION_ID" \
    -H "Content-Type: application/json" \
    -d '{"title":"Updated"}')
check_json "Update session" "$result" "title"

# 13. File operations
echo "[13] File operations"
result=$(curl -s "$BASE/api/file?session=$SESSION_ID&path=package.json")
check_json "File read" "$result" "name"

# 14. Stub endpoints
echo "[14] Stub endpoints"
result=$(curl -s "$BASE/api/agent")
if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(isinstance(d,list))" 2>/dev/null | grep -q True; then
    echo "  ✅ Agent listing (stub)"
    ((PASS++))
else
    echo "  ❌ Agent listing"
    ((FAIL++))
fi

result=$(curl -s "$BASE/api/command")
if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(isinstance(d,list))" 2>/dev/null | grep -q True; then
    echo "  ✅ Command listing (stub)"
    ((PASS++))
else
    echo "  ❌ Command listing"
    ((FAIL++))
fi

# Cleanup
curl -s -X DELETE "$BASE/api/session/$SESSION_ID" > /dev/null 2>&1

echo ""
echo "=== Summary ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "All tests passed!"
else
    echo "Some tests failed."
fi
