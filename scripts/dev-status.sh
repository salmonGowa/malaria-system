#!/usr/bin/env bash
# Reports whether each piece of the local dev stack is up.
set -euo pipefail

check() {
  local port="$1" name="$2" url="$3"
  if lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1; then
    printf "  %-12s :%-5s up    %s\n" "$name" "$port" "$url"
  else
    printf "  %-12s :%-5s down\n" "$name" "$port"
  fi
}

echo "Services:"
check 8000 backend "http://localhost:8000/api/"
check 8001 ml_service "http://localhost:8001/docs"
check 5173 frontend "http://localhost:5173"

echo
DB_CONTAINER="malaria-system-db-1"
if docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  state="$(docker inspect -f '{{.State.Status}}' "$DB_CONTAINER")"
  echo "db container ($DB_CONTAINER): $state"
else
  echo "db container ($DB_CONTAINER): not created yet — scripts/dev-up.sh will create it"
fi
