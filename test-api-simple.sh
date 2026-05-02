#!/bin/bash
# Simple API test - tests all OpenChamber API endpoints

BASE="http://localhost:3211"
PASS=0
FAIL=0

check() {
    local desc="$1"
    local expected="$2"
    local actual="$3"
    
    if echo "$actual" | grep -q "$expected"; then
        echo "  ✅ $desc"
        ((PASS++))
    else
        echo "  ❌ $desc (expected: $expected)"
        ((FAIL++))
    fi
}

echo "=== OpenChamber API Test ==="
echo ""

# 1. Health
echo "[1] Health"
result=$(curl -s "$BASE/health")
check "Health endpoint" '"ok":true' "$result"

# 2. Path
echo "[2] Path"
result=$(curl -s "$BASE/api/path")
check "Path endpoint" 'path' "$result"

# 3. Config
echo "[3] Config"
result=$(curl -s "$BASE/api/global/config")
check "Global config" 'homeDirectory' "$result"

result=$(curl -s "$BASE/api/config")
check "Config (alias)" 'homeDirectory' "$result"

# 4. Providers
echo "[4] Providers"
result=$(curl -s "$BASE/api/provider")
check "Provider listing" 'all' "$result"

# 5. Models
echo "[5] Models"
result=$(curl -s "$BASE/api/models")
check "Model listing" 'models' "$result"

# 6. Projects
echo "[6] Projects"
result=$(curl -s "$BASE/api/project")
check "Project listing" 'worktree' "$result"

# 7. Sessions
echo "[7] Sessions"
result=$(curl -s "$BASE/api/session")
check "Session listing" '[' "$result"

# 8. Create session
echo "[8] Create Session"
SESSION=$(curl -s -X POST "$BASE/api/session?directory=/home/manu" \
    -H "Content-Type: application/json" \
    -d '{"title":"Test"}')
SESSION_ID=$(echo "$SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
check "Create session" 'id' "$SESSION"

# 9. Get session
echo "[9] Get Session"
result=$(curl -s "$BASE/api/session/$SESSION_ID")
check "Get session" "$SESSION_ID" "$result"

# 10. Messages (empty)
echo "[10] Messages"
result=$(curl -s "$BASE/api/session/$SESSION_ID/message")
check "Message listing (empty)" '[]' "$result"

# 11. SSE
echo "[11] SSE Stream"
result=$(timeout 2 curl -s -N "$BASE/api/global/event" 2>&1 | head -1 || true)
check "SSE stream" 'server.connected' "$result"

# 12. Update session
echo "[12] Update Session"
result=$(curl -s -X PUT "$BASE/api/session/$SESSION_ID" \
    -H "Content-Type: application/json" \
    -d '{"title":"Updated"}')
check "Update session" 'Updated' "$result"

# 13. File listing
echo "[13] File operations"
result=$(curl -s "$BASE/api/file?session=$SESSION_ID&path=package.json")
check "File read" 'name' "$result"

# 14. Stub endpoints
echo "[14] Stub endpoints"
result=$(curl -s "$BASE/api/agent")
check "Agent listing (stub)" '[]' "$result"

result=$(curl -s "$BASE/api/command")
check "Command listing (stub)" '[]' "$result"

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
