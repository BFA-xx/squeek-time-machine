#!/usr/bin/env bash
# Checks a running deployment from the outside. Usage: scripts/smoke.sh https://time.example.com
set -u
BASE="${1:?usage: smoke.sh <site url>}"
BASE="${BASE%/}"
fail=0
ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; fail=1; }
code() { curl -sS -m 20 -o /dev/null -w "%{http_code}" "$@" 2>/dev/null; }

[ "$(code "$BASE/")" = "200" ] && ok "home page" || bad "home page"
[ "$(code "$BASE/archive")" = "200" ] && ok "2D archive" || bad "2D archive"
[ "$(code "$BASE/api/v1/healthz")" = "200" ] && ok "API through the site" || bad "API through the site"

state="$(curl -sS -m 20 "$BASE/api/v1/world/state" 2>/dev/null)"
echo "$state" | grep -q '"counts"' && ok "world state" || bad "world state"
echo "$state" | grep -q '"schema_mismatch"' && bad "a feed's format changed: update packages/shared/src/schemas.ts" || ok "feed formats"

first="$(curl -sS -m 20 "$BASE/api/v1/events?limit=1&minSignificance=2" 2>/dev/null | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)"
if [ -n "$first" ]; then
  ok "archive holds events"
  [ "$(code "$BASE/moment/$first")" = "200" ] && ok "share page" || bad "share page"
  [ "$(code "$BASE/moment/$first/opengraph-image")" = "200" ] && ok "preview image" || bad "preview image"
else
  bad "archive holds events (a new install needs a minute to fill)"
fi

[ "$(code -X POST -H "Origin: https://evil.example" -H "content-type: application/json" -d '{}' "$BASE/api/v1/auth/login")" = "403" ] && ok "cross-site writes refused" || bad "cross-site writes refused"
[ "$(code "$BASE/api/v1/admin/reports")" = "401" ] && ok "moderation closed" || bad "moderation closed"
curl -sS -m 40 -N "$BASE/api/v1/stream" 2>/dev/null | grep -q -m1 '^event:' && ok "live stream" || bad "live stream (check proxy buffering)"

exit $fail
