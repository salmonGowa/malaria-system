# Architecture

## Services

```
frontend (React+TS, :5173)
   |
   |  reads case/forecast/allocation data
   v
backend (Django+DRF, :8000) ----calls for forecast/allocation----> ml_service (FastAPI, :8001)
   |
   v
PostgreSQL + PostGIS (:5432)
```

- **backend** owns the relational source of truth: counties, facilities, users,
  case reports, climate observations, and *stored* forecast/allocation results.
  It never runs a model itself — it calls `ml_service` and persists what comes back.
- **ml_service** is stateless per-request: it takes inputs, runs a model or an
  optimizer, and returns a result. It doesn't own a database in this scaffold; if
  the trained model needs its own feature store later, that's a reasonable
  addition, not a redesign.
- **frontend** talks to `backend` for stored data and, later, can call `ml_service`
  directly for on-demand "what if" runs (e.g. "re-forecast with 20,000 more doses").

## Data model (backend/cases/models.py)

| Model | Purpose |
|---|---|
| `County` | One of the endemic-focus counties; carries geometry (PostGIS) and population |
| `HealthFacility` | Reporting site, linked to a county |
| `CaseReport` | Append-only, hash-chained case counts — see below |
| `ClimateObservation` | Rainfall/temperature/humidity per county per date, tagged by source |
| `ForecastRun` | Stored output of a forecasting model run |
| `VaccineAllocation` | Stored output of an allocation optimisation run, optionally linked to the `ForecastRun` it was based on |

## Why CaseReport is hash-chained instead of blockchain

The proposal's literature review (2.6) draws on blockchain-based surveillance
research but explicitly scopes full blockchain implementation out of an
undergraduate project. What's actually being asked for — an auditable trail,
tamper-evident records, verifiable reporting — doesn't require distributed
consensus or a ledger network; it requires that no one, including an admin with
database access, can silently edit history without it being detectable.

`CaseReport.save()` refuses updates (`pk` already set → raise), `delete()` is
disabled entirely, and each record's `record_hash` is computed from its own
content plus the previous record's hash — the same core idea as a blockchain's
hash-chaining, without needing a chain of custody across independent nodes. Corrections
happen by inserting a new record with `supersedes` pointing at the one it corrects,
so the original stays in the chain. `CaseReport.verify_chain_link()` lets you spot-check
that a record's stored hash still matches its content; a full audit would recompute
the chain from record 1 forward and confirm each `previous_hash` matches the prior
record's `record_hash`.

If you later decide you *do* want real distributed tamper-evidence (e.g. multiple
independent county health offices each holding a copy of the chain so no single
party can rewrite it), that's a bigger step — worth a deliberate decision once the
prototype is otherwise working, not something to build speculatively now.

## ML service internals

- `app/forecasting.py` — **placeholder only**. Returns zeros. Module 2 replaces
  `naive_forecast()` with a trained model loaded from disk.
- `app/allocation.py` — **real implementation**. Solves a linear program (PuLP)
  that maximises risk-weighted dose allocation subject to a total-dose constraint
  and per-county population caps.

### Known limitation in the current allocation model

A pure linear objective (`sum(risk_score_i * doses_i)`) has a corner-solution
tendency: the solver will pour doses into the single highest-risk county up to
its population cap before allocating anything elsewhere, because linear returns
never diminish. That's a legitimate baseline and matches the proposal's citation
of sub-national prioritisation outperforming uniform rollout — but if you want
allocation spread across multiple high-risk counties rather than concentrated in
one, the fix is a concave objective (e.g. `sqrt(doses_i)` weighted by risk, or a
per-county allocation ceiling as a policy constraint) rather than more LP
machinery. Worth deciding once you have real multi-county forecast data to test
it against, not before.
