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

## Generating real forecasts/allocations (Task 6)

`backend/cases/services/forecast_generation_service.py` and
`allocation_generation_service.py` are what actually call ml_service and
store the result — `ForecastRunViewSet`/`VaccineAllocationViewSet` expose
this as `POST /api/forecasts/generate/` and `POST /api/allocations/generate/`
(both `IsAuthenticatedOrReadOnly`, matching `CaseReportViewSet`'s existing
write-permission pattern).

ml_service has no database of its own, so `ForecastGenerationService`
gathers each county's trailing rainfall (`ClimateObservation`,
`source=CHIRPS`) and case history (`HistoricalCaseData`,
`source=synthetic_v1`) and sends it in the request body — verified
end-to-end against the live model, not just unit-tested against a mock (see
git history / session notes for the actual run). `AllocationGenerationService`
then uses each county's latest stored `ForecastRun` and calls `/allocate`,
linking the result back via `VaccineAllocation.based_on_forecast`.

**Not yet built:** a frontend UI for triggering either endpoint. The
dashboard has no login/auth flow at all yet (no session or token
management anywhere in `frontend/`), and both endpoints correctly require
authentication — adding "Generate" buttons before that exists would just
403 for every real user, so this is left as the clear next step rather than
half-built.

If you later decide you *do* want real distributed tamper-evidence (e.g. multiple
independent county health offices each holding a copy of the chain so no single
party can rewrite it), that's a bigger step — worth a deliberate decision once the
prototype is otherwise working, not something to build speculatively now.

## ML service internals

- `app/forecasting.py` — **real implementation**. Loads a trained XGBoost
  classifier (outbreak risk) + regressor (predicted cases) from
  `ml_service/models/`, built by `data/scripts/train_forecast_model.py`.
  Feature engineering lives in `app/features.py`, shared by training and
  live inference so the two can't drift apart. Raises a clear error (mapped
  to HTTP 503/422 in `main.py`) rather than guessing when no model has been
  trained yet or a request doesn't carry enough trailing history — never
  silently returns a placeholder value dressed up as a real one.
- `app/compartmental.py` — **real implementation**, the Task 4 SEIR
  benchmark: a rainfall-modulated SEIR model solved with `scipy.integrate.solve_ivp`,
  calibrated per county via `scipy.optimize.least_squares` against its own
  case history. Exists solely to benchmark the trained model against (see
  Model results below) — not wired to any interactive endpoint. This is
  separate from `app/simulation.py`, the illustrative, user-parameter-driven
  SEIR behind the dashboard's Simulations page — that one is unchanged and
  still not fit to any data by design (see its own docstring).
- `app/allocation.py` — **real implementation**. Solves a linear program (PuLP)
  that maximises risk-weighted dose allocation subject to a total-dose constraint
  and per-county population caps. Wired to real forecasts via
  `backend/cases/services/allocation_generation_service.py` (below) rather
  than only being reachable through the dashboard's what-if simulator.

### Model results (Objectives 2 & 3)

Trained on `HistoricalCaseData` (`source=synthetic_v1` — see that model's
docstring for why case history is synthetic while climate isn't) against 5
counties x 60 months, a chronological 48/12-month train/test split, 5-fold
CV on the training set, evaluated on a held-out test set the model never
saw during training or calibration:

| | Accuracy | AUC | Sensitivity | Specificity |
|---|---|---|---|---|
| Climate-free baseline (case history + seasonality only) | 0.767 | 0.660 | 0.167 | 0.833 |
| **Full model** (+ rainfall/temperature/humidity) | 0.883 | **0.716** | 0.167 | 0.963 |
| SEIR compartmental benchmark | 0.767 | 0.574 | 0.000 | 0.852 |

Objective 2's AUC >= 0.8 target is **not met** (0.716) — reported as-is, not
tuned after the fact to cross the line. Objective 3's "measurable
improvement from climate variables" **is** demonstrated: +0.056 AUC over the
climate-free baseline, and the full model clearly outperforms the SEIR
benchmark as the objective's own benchmarking requirement asks.

Why 0.716 rather than 0.8, honestly: `confirmed_cases` is a synthetic series
(see `data/scripts/generate_synthetic_case_history.py`), generated with
genuine negative-binomial noise rather than a clean deterministic signal, on
a small dataset (225 training rows) with a rare positive class (~16%
outbreak-labeled months) — exactly the regime where classification AUC is
hardest to push high regardless of model choice. This is a property of the
training data's difficulty, not an uncalibrated model: k-fold CV (0.677
mean AUC) and the held-out test set (0.716) roughly agree, so it isn't
overfit to one split either. The real fix is real data — DHIS2/KEMRI
facility-level history at the depth Objective 1 targets, once accessible
(see `docs/data-sources.md`) — not further hyperparameter search against a
synthetic target.

Re-run: `data/scripts/train_forecast_model.py` (writes
`ml_service/models/forecast_metadata.json` with the full metrics + county
list + training window for reproducibility).

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
