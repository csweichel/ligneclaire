#!/usr/bin/env bash

set -euo pipefail

STUDIO_PORT="${STUDIO_PORT:-5173}"
RUNTIME_PORT="${RUNTIME_PORT:-7345}"
PORT_NAME="${LC_STUDIO_PORT_NAME:-LigneClaire Studio}"

curl -fsS "http://127.0.0.1:${RUNTIME_PORT}/api/programs" >/dev/null
curl -fsS "http://127.0.0.1:${STUDIO_PORT}" >/dev/null

ports_json="$(ona environment port list -o json 2>/dev/null || true)"
if ! printf '%s' "${ports_json}" | grep -q "\"port\": ${STUDIO_PORT}\\b"; then
  ona environment port open "${STUDIO_PORT}" \
    --admission creator_only \
    --protocol http \
    --name "${PORT_NAME}" \
    --dont-wait >/dev/null
fi

echo "LigneClaire studio is ready on port ${STUDIO_PORT}"

