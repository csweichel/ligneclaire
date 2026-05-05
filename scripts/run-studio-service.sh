#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

STUDIO_PORT="${STUDIO_PORT:-5173}"
RUNTIME_PORT="${RUNTIME_PORT:-7345}"
PORT_NAME="${LC_STUDIO_PORT_NAME:-LigneClaire Studio}"
EXPECTED_OUTPUT_PATH_SUFFIX="/gitpod-service-start-studio.output"

cd "${REPO_ROOT}"

ensure_automation_context() {
  local output_path="${GITPOD_OUTPUT:-}"

  if [[ "${output_path}" == *"${EXPECTED_OUTPUT_PATH_SUFFIX}" ]]; then
    return 0
  fi

  echo "This service may only be started by Ona automations." >&2
  echo "Use 'ona automations service start studio' or the configured automation trigger." >&2
  exit 1
}

ensure_studio_port() {
  local ports_json
  ports_json="$(ona environment port list -o json 2>/dev/null || true)"

  if printf '%s' "${ports_json}" | grep -q "\"port\": ${STUDIO_PORT}\\b"; then
    return 0
  fi

  ona environment port open "${STUDIO_PORT}" \
    --admission creator_only \
    --protocol http \
    --name "${PORT_NAME}" \
    --dont-wait >/dev/null
}

ensure_automation_context
ensure_studio_port || true

pnpm install --frozen-lockfile
pnpm generate:registry

runtime_started=0
runtime_pid=""
studio_pid=""

kill_process_tree() {
  local pid="$1"
  local child=""

  if [[ -z "${pid}" ]]; then
    return 0
  fi

  while read -r child; do
    if [[ -n "${child}" ]]; then
      kill_process_tree "${child}"
    fi
  done < <(pgrep -P "${pid}" || true)

  kill "${pid}" 2>/dev/null || true
  wait "${pid}" 2>/dev/null || true
}

if ! curl -fsS "http://127.0.0.1:${RUNTIME_PORT}/api/programs" >/dev/null 2>&1; then
  pnpm runtime >/tmp/ligneclaire-runtime.log 2>&1 &
  runtime_pid="$!"
  runtime_started=1
fi

cleanup() {
  kill_process_tree "${studio_pid}"

  if [[ "${runtime_started}" -eq 1 && -n "${runtime_pid}" ]]; then
    kill_process_tree "${runtime_pid}"
  fi
}

trap cleanup EXIT INT TERM

pnpm --filter @ligneclaire/studio exec vite --host 0.0.0.0 --port "${STUDIO_PORT}" &
studio_pid="$!"
wait "${studio_pid}"
