#!/usr/bin/env bash
# Builds the Docker image and checks it really serves: health, the site, a guide, the hidden internal
# routes, a JSON error, and data surviving a restart. Used by CI (.github/workflows/ci.yml) and runnable
# locally: `bash scripts/docker-smoke.sh`. Everything it creates (container, volume) is removed after.
set -euo pipefail

IMAGE="${IMAGE:-sendm8:smoke}"
NAME="sendm8-smoke-$$"
VOLUME="sendm8-smoke-data-$$"
PORT="${PORT:-8977}"
BASE="http://127.0.0.1:${PORT}"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; docker logs --tail 40 "$NAME" >&2 || true; exit 1; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

docker build -t "$IMAGE" .

KEY="$(head -c 32 /dev/urandom | base64)"
docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:8787" -v "${VOLUME}:/data" \
  -e APP_URL="$BASE" -e BETTER_AUTH_SECRET="smoke-secret-smoke-secret-smoke-1234" \
  -e IP_HASH_SECRET="smoke-ip-secret" -e ENCRYPTION_KEY="$KEY" "$IMAGE" >/dev/null

wait_ready() {
  for _ in $(seq 1 90); do
    [ "$(status "$BASE/health" || true)" = "200" ] && return 0
    sleep 2
  done
  return 1
}

wait_ready || fail "the container never answered /health"
[ "$(curl -s "$BASE/health")" = '{"ok":true}' ] || fail "/health isn't {ok:true}"
[ "$(status "$BASE/")" = "200" ] || fail "the home page isn't served"
[ "$(status "$BASE/guides/hugo-contact-form/")" = "200" ] || fail "a built guide page isn't served"
# Wrangler's internal routes (including the cron trigger) must not be reachable from outside.
[ "$(status "$BASE/cdn-cgi/handler/scheduled?cron=0+*+*+*+*")" = "404" ] || fail "an internal route is exposed"
[ "$(status "$BASE/__scheduled")" = "404" ] || fail "/__scheduled is exposed"
# A JSON error from the Worker itself.
OUT="$(curl -s -X POST "$BASE/f/0000000000" -H 'accept: application/json' -d '{}')"
echo "$OUT" | grep -q '"form_not_found"' || fail "unexpected answer for an unknown form: $OUT"
# Real data written to the volume survives a restart.
curl -s -X POST "$BASE/f/smoke@sendm8.dev" -H 'accept: application/json' -H 'content-type: application/json' \
  -d '{"message":"smoke test"}' | grep -q '"ok":true' || fail "a submission wasn't accepted"
docker restart "$NAME" >/dev/null
wait_ready || fail "the container didn't come back after a restart"
COUNT="$(docker exec "$NAME" sh -c 'cd /tmp/sendm8-runtime && node /app/node_modules/wrangler/bin/wrangler.js d1 execute DB --local --persist-to /data/state --config /tmp/sendm8-runtime/wrangler.json --json --command "select count(*) n from submissions"' | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$' || true)"
[ "${COUNT:-0}" -ge 1 ] || fail "the submission didn't survive a restart (count: ${COUNT:-none})"
[ "$(docker exec "$NAME" whoami)" = "node" ] || fail "the container isn't running as the node user"

echo "docker smoke test passed"
