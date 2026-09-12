#!/usr/bin/env bash
# Brings up the full local dev stack:
#   - Postgres/PostGIS  (docker container)
#   - Django backend    (host process, shared venv)      :8000
#   - FastAPI ml_service (host process, shared venv)      :8001
#   - Vite frontend      (host process, npm)              :5173
#
# Only the db runs via Docker day-to-day here — backend/ml_service/frontend
# run directly on the host from the shared `env/` virtualenv, not through
# `docker compose up`. This script matches that, and is idempotent: each
# piece is skipped if its port is already listening.
#
# Usage: scripts/dev-up.sh [--no-frontend]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

VENV_PY="$ROOT/env/bin/python"
VENV_UVICORN="$ROOT/env/bin/uvicorn"
DB_CONTAINER="malaria-system-db-1"

port_listening() {
  lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -q ":$1 "
}

wait_for_port() {
  local port="$1" name="$2" tries="${3:-30}"
  for _ in $(seq 1 "$tries"); do
    port_listening "$port" && return 0
    sleep 1
  done
  echo "  ! $name didn't come up on port $port within ${tries}s — check $LOG_DIR/$name.log" >&2
  return 1
}

echo "== Postgres/PostGIS (db) =="
if docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  if [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER")" = "true" ]; then
    echo "  already running"
  else
    docker start "$DB_CONTAINER" >/dev/null
    echo "  started"
  fi
else
  echo "  no existing container — creating via docker compose"
  (cd "$ROOT" && docker compose up -d db)
fi

printf "  waiting for postgres..."
for _ in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -U malaria >/dev/null 2>&1; then
    echo " ready"
    break
  fi
  sleep 1
  printf "."
done

echo "== Django backend (:8000) =="
if port_listening 8000; then
  echo "  already running"
else
  (cd "$ROOT/backend" && nohup "$VENV_PY" manage.py runserver 0.0.0.0:8000 >"$LOG_DIR/backend.log" 2>&1 & disown)
  wait_for_port 8000 backend
  echo "  started -> $LOG_DIR/backend.log"
fi

echo "== ml_service (:8001) =="
if port_listening 8001; then
  echo "  already running"
else
  (cd "$ROOT/ml_service" && nohup "$VENV_UVICORN" main:app --host 0.0.0.0 --port 8001 --reload >"$LOG_DIR/ml_service.log" 2>&1 & disown)
  wait_for_port 8001 ml_service
  echo "  started -> $LOG_DIR/ml_service.log"
fi

if [ "${1:-}" != "--no-frontend" ]; then
  echo "== Frontend (:5173) =="
  if port_listening 5173; then
    echo "  already running"
  else
    if [ ! -d "$ROOT/frontend/node_modules" ]; then
      echo "  node_modules missing — running npm install first"
      (cd "$ROOT/frontend" && npm install)
    fi
    (cd "$ROOT/frontend" && nohup npm run dev -- --host >"$LOG_DIR/frontend.log" 2>&1 & disown)
    wait_for_port 5173 frontend
    echo "  started -> $LOG_DIR/frontend.log"
  fi
fi

cat <<EOF

Ready:
  Django API      http://localhost:8000/api/
  Django admin    http://localhost:8000/admin/
  ml_service      http://localhost:8001/docs
  Frontend        http://localhost:5173

Logs in $LOG_DIR/. Check status: scripts/dev-status.sh. Stop: scripts/dev-down.sh.
EOF
