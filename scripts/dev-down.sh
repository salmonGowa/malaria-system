#!/usr/bin/env bash
# Stops the frontend, ml_service, and Django dev servers started by
# scripts/dev-up.sh. Leaves the db container running by default — it's
# cheap to leave up and slower to reinitialize; pass --db to stop it too.
#
# Usage: scripts/dev-down.sh [--db]

set -euo pipefail

kill_port() {
  local port="$1" name="$2"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Stopping $name (:$port, pid $pids)"
    echo "$pids" | xargs -r kill
  else
    echo "$name (:$port) not running"
  fi
}

kill_port 5173 frontend
kill_port 8001 ml_service
kill_port 8000 backend

if [ "${1:-}" = "--db" ]; then
  if docker stop malaria-system-db-1 >/dev/null 2>&1; then
    echo "Stopped db container"
  else
    echo "db container not running"
  fi
fi
