#!/bin/sh
# Drives the bridge through green -> yellow -> red so you can verify the
# extension UI without running a real Claude Code session.
#   ./test-state.sh [delay-seconds]

PORT="${STOPLIGHT_PORT:-4747}"
DELAY="${1:-3}"
BASE="http://127.0.0.1:${PORT}/state"

post() {
  echo "-> $1 ($2)"
  curl -s -X POST "$BASE" \
    -H 'Content-Type: application/json' \
    -d "{\"state\":\"$1\",\"session\":\"test-session\",\"detail\":\"$2\"}" \
    || { echo "bridge not reachable on port ${PORT} — is it running? (cd bridge && npm start)"; exit 1; }
  echo ""
}

post green "test: Claude is working"
sleep "$DELAY"
post yellow "test: Claude needs your input"
sleep "$DELAY"
post red "test: task finished"
echo "Done. Current state:"
curl -s "$BASE"
echo ""
