# Roadmap

Mapped to the proposal's Chapter 1.10 schedule.

| Proposal task | Status | Notes |
|---|---|---|
| Task 3: Data collection & preprocessing | **Done** | `data/scripts/aggregate_climate.py` (real CHIRPS, 5 counties x 60 months), `generate_synthetic_case_history.py` + `generate_synthetic_climatology.py` (synthetic, clearly source-tagged — see `docs/data-sources.md` for why case history isn't real yet), `load_county_boundaries.py` (real GADM geometry) |
| Task 4: Compartmental model | **Done** | `ml_service/app/compartmental.py` — rainfall-driven SEIR, `scipy.integrate.solve_ivp` + `scipy.optimize.least_squares`, used as Objective 2's benchmark. Separate from `app/simulation.py`, the interactive illustrative one behind the dashboard — that's unchanged |
| Task 5: ML model | **Done, honestly short of the 0.8 target** | `data/scripts/train_forecast_model.py` — XGBoost classifier+regressor, k-fold CV + held-out test, benchmarked against Task 4's SEIR. AUC 0.716 (target 0.8), beats SEIR (0.574) and a climate-free baseline (0.660). See `docs/architecture.md`'s "Model results" for the honest why and the real fix (real data) |
| Task 6: Allocation module | **Backend done, no frontend trigger yet** | `allocation.py`'s LP now wired to real stored forecasts via `ForecastGenerationService`/`AllocationGenerationService` + `POST /api/forecasts/generate/` and `/api/allocations/generate/` — verified end-to-end against the live model. No dashboard button yet: those endpoints require auth and the frontend has no login flow at all, so a button would just 403 |
| Task 7: Dashboard | **Mostly done** | Charts, map (real county boundaries), allocation/forecast tables, theming, responsive layout all built. Missing: case-report submission form, forecast/allocation trigger UI (blocked on Task 6's auth gap above) |
| Task 8: Testing & validation | **Partially done** | `backend/cases/tests.py` covers the hash chain, climate aggregation (incl. two real bugs found+fixed this pass), and the generation services (mocked ml_service). `ml_service/tests/` is new — allocation, features, compartmental, forecasting, and endpoint-level tests, 20 passing. Not done: k-fold CV *reporting* as a standing artifact (currently just printed by the training script) and frontend (Jest) tests |

## What actually changed vs. the original scaffold

This file used to describe Tasks 4-8 as entirely unbuilt. They're now
mostly built, checked against real execution (not just written), and
committed alongside the honest numbers rather than numbers massaged to hit
the proposal's targets. The two real gaps left are: (1) real historical
case data — Objective 1's "5 years of monthly data" is currently a
synthetic series driven by real CHIRPS rainfall, not observed case counts,
because DHIS2/KEMRI access at that depth isn't available within this
project's timeline (see `docs/data-sources.md`); (2) a frontend auth flow,
which the forecast/allocation trigger buttons need before they can be built
for real rather than as something that 403s.

## Suggested next actions, in order

1. **Auth flow** (frontend login + token/session handling) — unblocks
   Task 6/7's trigger UI, which is otherwise the most visible remaining gap.
2. **Frontend trigger UI** once (1) exists: "Generate forecast" /
   "Run allocation" buttons calling the endpoints described in
   `docs/architecture.md`'s "Generating real forecasts/allocations" section.
3. **Real case data**, if/when DHIS2 or KEMRI access comes through — swap
   `generate_synthetic_case_history.py`'s output for the real thing; nothing
   downstream (features, training, forecasting) needs to change, since both
   just read `HistoricalCaseData` regardless of its `source`.
4. **Case-report submission form** — the API already accepts authenticated
   POSTs to `/api/case-reports/` (hash-chained, append-only); it just needs
   a UI, same auth dependency as (1).
