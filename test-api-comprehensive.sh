#!/bin/bash
# Comprehensive API test for OpenChamber SDK compatibility layer
# Tests all endpoints from backend perspective (curl) and summarizes frontend tests needed

set -e
BASE_URL="http://localhost:3211"
PASS=0
FAIL=0

function test_endpoint() {
    local method="$1"
    local url="$2"
    local expected="$3"
    local body="$4"
    local headers="$5"
    
    local cmd="curl -s -X $method \"$BASE_URL$url\""
    if [ -n "$body" ]; then
        cmd="$cmd -H 'Content-Type: application/json' -d '$body'"
    fi
    if [ -n "$headers" ]; then
        cmd="$cmd $headers"
    fi
    cmd="$cmd -w '\n%{http_code}'"
    
    echo -n "  Testing $method $url ... "
    result=$(eval $cmd)
    http_code=$(echo "$result" | tail -1)
    body_result=$(echo "$result" | head -n -1)
    
    if echo "$http_code" | grep -q "$expected"; then
        echo "PASS (HTTP $http_code)"
        ((PASS++))
    else
        echo "FAIL (expected $expected, got $http_code)"
        echo "  Response: $body_result" | head -c 200
        ((FAIL++))
    fi
}

echo "=== OpenChamber API Comprehensive Test ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Health check
echo "[1] Health Check"
test_endpoint "GET" "/health" "200"

# 2. Path
echo "[2] Path endpoint"
test_endpoint "GET" "/api/path" "200"

# 3. Config
echo "[3] Config endpoints"
test_endpoint "GET" "/api/global/config" "200"
test_endpoint "GET" "/api/config" "200"

# 4. Project listing
echo "[4] Project listing"
test_endpoint "GET" "/api/project" "200"

# 5. Provider listing
echo "[5] Provider listing"
test_endpoint "GET" "/api/provider" "200"

# 6. Model listing
echo "[6] Model listing"
test_endpoint "GET" "/api/models" "200"

# 7. Session CRUD
echo "[7] Session CRUD"
# Create session
SESSION_ID=$(curl -s -X POST "$BASE_URL/api/session?directory=/home/manu" \
    -H "Content-Type: application/json" \
    -d '{"title":"API Test Session"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
echo "  Created session: $SESSION_ID"
test_endpoint "GET" "/api/session" "200"
test_endpoint "GET" "/api/session/$SESSION_ID" "200"
test_endpoint "PUT" "/api/session/$SESSION_ID" "200" '{"title":"Updated Test Session"}'

# 8. Message listing (empty)
echo "[8] Message listing"
test_endpoint "GET" "/api/session/$SESSION_ID/message" "200"

# 9. File operations
echo "[9] File operations"
test_endpoint "GET" "/api/file?session=$SESSION_ID&path=package.json" "200"

# 10. SSE endpoint (just check it accepts connection)
echo "[10] SSE endpoint"
# Note: SSE is a streaming endpoint, we just check it accepts the request
result=$(curl -s -N --max-time 2 "$BASE_URL/api/global/event" 2>&1 | head -1 || true)
if echo "$result" | grep -q "server.connected"; then
    echo "  PASS (SSE stream working)"
    ((PASS++))
else
    echo "  FAIL (SSE stream not working)"
    ((FAIL++))
fi

# 11. Prompt (async)
echo "[11] Prompt async"
# This requires a valid model - using one from the model list
MODEL_ID=$(curl -s "$BASE_URL/api/models" | python3 -c "import sys,json; models=json.load(sys.stdin)['models']; print(models[0]['id'] if models else '')" 2>/dev/null)
if [ -n "$MODEL_ID" ]; then
    PROVIDER_ID=$(echo "$MODEL_ID" | cut -d'/' -f1)
    MODEL_SHORT_ID=$(echo "$MODEL_ID" | cut -d'/' -f2)
    test_endpoint "POST" "/api/session/$SESSION_ID/prompt_async" "204" \
        "{\"model\":{\"providerID\":\"$PROVIDER_ID\",\"modelID\":\"$MODEL_SHORT_ID\"},\"parts\":[{\"id\":\"p1\",\"type\":\"text\",\"text\":\"test\"}]}"
else
    echo "  SKIP (no models available)"
fi

# 12. LSP endpoints (stubs)
echo "[12] LSP endpoints (stubs)"
test_endpoint "GET" "/api/lsp/session/$SESSION_ID/file" "200"

# 13. Agent listing (stub)
echo "[13] Agent listing (stub)"
test_endpoint "GET" "/api/agent" "200"

# 14. Command listing (stub)
echo "[14] Command listing (stub)"
test_endpoint "GET" "/api/command" "200"

# 15. Git endpoints (stubs)
echo "[15] Git endpoints (stubs)"
test_endpoint "GET" "/api/git/session/$SESSION_ID/status" "200"

# 16. VCS endpoints (stubs)
echo "[16] VCS endpoints (stubs)"
test_endpoint "GET" "/api/vcs/session/$SESSION_ID/commits" "200"

# 17. Permission endpoints
echo "[17] Permission endpoints"
test_endpoint "GET" "/api/session/$SESSION_ID/permission" "200"

# Cleanup
echo ""
echo "[Cleanup] Deleting test session"
curl -s -X DELETE "$BASE_URL/api/session/$SESSION_ID" > /dev/null 2>&1 || true

echo ""
echo "=== Test Summary ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "All backend tests passed!"
else
    echo "Some tests failed. Check the output above."
    exit 1
fi

echo ""
echo "=== Frontend Tests Needed ==="
echo "The following should be tested from the frontend using the OpenChamber SDK:"
echo "1. Bootstrap flow (path → project → provider → config → SSE connection)"
echo "2. Session creation from UI"
echo "3. Model selection from UI"
echo "4. Message sending and streaming response"
echo "5. File tree loading"
echo "6. Session listing and switching"
