#!/usr/bin/env bash
# Smoke test the MCP server end-to-end via stdio JSON-RPC.
#
# Sends: initialize, tools/list, then a tools/call for each of the 4 tools
# Verifies: each response is valid JSON with no error frame.

set -euo pipefail

cd "$(dirname "$0")/.."

MCP_BIN="mcp/dist/index.js"
if [ ! -x "$MCP_BIN" ]; then
  echo "✗ MCP build missing or not executable: $MCP_BIN"
  echo "  run \`make build-mcp\` first"
  exit 1
fi

pass=0
fail=0

# Build the JSON-RPC frame stream. Tools are called against the LIVE public
# API, so failures here include real-world latency.
frames() {
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-mcp.sh","version":"0.0"}}}'
  sleep 0.3
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  sleep 0.3
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  sleep 0.3
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_domain_availability","arguments":{"domain":"ad402.sh"}}}'
  sleep 8
  echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_domain_info","arguments":{"domain":"github.com"}}}'
  sleep 5
  echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"search_domains","arguments":{"keyword":"donataxes","limit":5}}}'
  sleep 20
  # valuation skipped by default because it costs Gemini credits — opt-in via TEST_VALUATION=1
  if [ "${TEST_VALUATION:-0}" = "1" ]; then
    echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"valuate_domain","arguments":{"domain":"crypto.com"}}}'
    sleep 10
  fi
}

out=$(frames | node "$MCP_BIN" 2>/dev/null || true)

check() {
  local id=$1 name=$2
  local line
  line=$(printf '%s\n' "$out" | grep -E "\"id\":${id}([,}])" | head -1 || true)
  if [ -z "$line" ]; then
    echo "  ✗ ${name} (id=${id}) — no response"
    fail=$((fail + 1))
    return
  fi
  if echo "$line" | grep -q '"isError":true'; then
    echo "  ✗ ${name} (id=${id}) — returned isError"
    echo "    ${line:0:200}"
    fail=$((fail + 1))
    return
  fi
  if ! echo "$line" | grep -q '"result"'; then
    echo "  ✗ ${name} (id=${id}) — no result field"
    fail=$((fail + 1))
    return
  fi
  echo "  ✓ ${name}"
  pass=$((pass + 1))
}

echo "MCP smoke test:"
check 1 "initialize"
check 2 "tools/list"
check 3 "check_domain_availability(ad402.sh)"
check 4 "get_domain_info(github.com)"
check 5 "search_domains(donataxes, limit=5)"
if [ "${TEST_VALUATION:-0}" = "1" ]; then
  check 6 "valuate_domain(crypto.com)"
fi

echo
echo "${pass} pass / ${fail} fail"
if [ "$fail" -gt 0 ]; then
  exit 1
fi
