---
name: dev-up
description: Start, stop, or check the local dev stack for malaria-system (Postgres/PostGIS container, Django backend, FastAPI ml_service, Vite frontend) — use whenever asked to run/launch/start this app, or when a request to it fails with a connection-refused error.
---

# Running malaria-system locally

This repo has a `docker-compose.yml`, but in day-to-day dev here **only the
`db` service runs via Docker**. The backend, ml_service, and frontend run
directly on the host instead:

- `db` — Postgres/PostGIS, Docker container `malaria-system-db-1`, port 5432
- `backend` — Django, `env/bin/python manage.py runserver`, port 8000
- `ml_service` — FastAPI, `env/bin/uvicorn main:app --reload`, port 8001
- `frontend` — Vite, `npm run dev`, port 5173

All three host processes share one virtualenv at `env/` (repo root).

## Commands

```bash
scripts/dev-up.sh            # start everything that isn't already up (idempotent)
scripts/dev-up.sh --no-frontend   # skip the frontend, just db + backend + ml_service
scripts/dev-status.sh        # show what's up and what isn't
scripts/dev-down.sh          # stop backend/ml_service/frontend (db left running)
scripts/dev-down.sh --db     # also stop the db container
```

`dev-up.sh` logs each service to `logs/{backend,ml_service,frontend}.log` and
is safe to re-run — it checks each port before starting anything.

## Symptoms this fixes

- `django.db.utils.OperationalError: connection to server ... port 5432 failed: Connection refused`
  → the db container is stopped. `scripts/dev-up.sh` (or just `docker start malaria-system-db-1`) fixes it.
- Frontend Simulations page shows "Simulation failed: Failed to fetch"
  → `ml_service` isn't running on :8001. `scripts/dev-up.sh` fixes it.
- Dashboard shows "Could not reach backend"
  → Django isn't running on :8000. `scripts/dev-up.sh` fixes it.

## One representative check

After `scripts/dev-up.sh`, confirm with:

```bash
curl -sf http://localhost:8000/api/ -o /dev/null -w "backend: %{http_code}\n"
curl -sf http://localhost:8001/docs -o /dev/null -w "ml_service: %{http_code}\n"
curl -sf http://localhost:5173 -o /dev/null -w "frontend: %{http_code}\n"
```

All three should print `200`.
