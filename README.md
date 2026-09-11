# AI-Powered Malaria Tracking, Forecasting, and Vaccine Allocation

Prototype scaffold for the three-module system described in the proposal:

1. **Case tracking** (`backend/`) — Django + Django REST Framework, PostgreSQL/PostGIS.
   Append-only, hash-chained case reports (tamper-evident, no blockchain infra needed).
2. **Forecasting + allocation** (`ml_service/`) — FastAPI microservice. Model training
   lives in `ml_service/notebooks_or_scripts` (added next phase); FastAPI just serves
   predictions/recommendations to the backend and dashboard.
3. **Dashboard** (`frontend/`) — React + TypeScript (Vite), talks to both services.

No TensorFlow anywhere. ML stack is scikit-learn + XGBoost, with PyTorch available
only if you decide you want an LSTM later (optional, not installed by default).

## Why two backend services instead of one

The proposal calls for Django REST Framework *and* FastAPI. Splitting them isn't
redundant: Django owns the source-of-truth relational data (cases, facilities,
counties, users, admin/audit) where its ORM, migrations, and admin panel save time.
FastAPI owns the ML boundary (loading model artifacts, running inference, running the
optimizer) where its async performance and typed request/response models are the
better fit. The Django backend calls the FastAPI service over HTTP when it needs a
forecast or an allocation recommendation.

If you'd rather run one service, say so and I'll fold `ml_service` into Django as a
regular app — the models/optimizer code doesn't change, only where it's mounted.

## Quick start

```bash
docker compose up --build
```

- Django API: http://localhost:8000/api/
- Django admin: http://localhost:8000/admin/
- FastAPI (ML) service: http://localhost:8001/docs
- Frontend: http://localhost:5173

First run: `docker compose exec backend python manage.py migrate` then
`docker compose exec backend python manage.py createsuperuser`.

## What's in this scaffold vs. what's next

**Here now:** repo layout, Postgres+PostGIS schema for counties/facilities/case
reports/climate observations/forecast runs/allocations, DRF CRUD + admin for case
reports with hash-chain integrity, FastAPI skeleton with stub forecast/allocation
endpoints, React dashboard shell with routing and an API client, docker-compose to
run it all locally.

**Not yet built (see `docs/roadmap.md`):** actual data ingestion from WHO/KEMRI/
CHIRPS/ERA5, the trained forecasting model, the SEIR compartmental model, the
optimization allocation logic, dashboard charts. These are the next phases and each
maps to a task in the proposal's Chapter 1.10 schedule.

See `docs/architecture.md` for the data model and `docs/data-sources.md` for where to
get case and climate data.
