#!/bin/sh
# Reports a Claude Code hook event to the stoplight bridge.
#   report-state.sh <green|yellow|red|grey> [default detail]
# Reads the hook's JSON payload on stdin to pick up session_id and, for
# Notification events, the human-readable message.
# Must never block or break Claude Code: short timeouts, always exit 0.

STATE="$1"
DETAIL="${2:-}"
PORT="${STOPLIGHT_PORT:-4747}"

PAYLOAD_IN=$(cat 2>/dev/null || true)

# Crude but dependency-free JSON field extraction; sanitized so the values
# can't break the JSON we send.
extract() {
  printf '%s' "$PAYLOAD_IN" \
    | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" \
    | head -n 1 | tr -d '\\"' | cut -c1-200
}

SESSION=$(extract session_id)
MESSAGE=$(extract message)
[ -n "$MESSAGE" ] && DETAIL="$MESSAGE"

# PermissionRequest and PreToolUse fire near-simultaneously and their async
# reports race; delay the yellow so it always lands after the racing green.
# If the prompt is really waiting on the user, nothing fires after it, so
# yellow holds; if the tool was auto-approved, the next event self-corrects.
if [ "$(extract hook_event_name)" = "PermissionRequest" ]; then
  sleep 0.3
fi

# A question dialog is Claude waiting on you, not Claude working: the
# AskUserQuestion tool's PreToolUse would otherwise report green.
if [ "$STATE" = "green" ] \
  && [ "$(extract hook_event_name)" = "PreToolUse" ] \
  && [ "$(extract tool_name)" = "AskUserQuestion" ]; then
  STATE="yellow"
  DETAIL="Claude is asking you a question"
fi

curl -s -X POST "http://127.0.0.1:${PORT}/state" \
  -H 'Content-Type: application/json' \
  --max-time 1 \
  -d "{\"state\":\"${STATE}\",\"session\":\"${SESSION}\",\"detail\":\"${DETAIL}\"}" \
  >/dev/null 2>&1 || true

exit 0
