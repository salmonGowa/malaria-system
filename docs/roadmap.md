# Roadmap

Mapped to the proposal's Chapter 1.10 schedule.

| Proposal task | Status | Notes |
|---|---|---|
| Task 3: Data collection & preprocessing | **Done** | `data/scripts/aggregate_climate.py` (real CHIRPS, 14 counties x 60 months — see `seed_counties.py` for the county list), `generate_synthetic_case_history.py` + `generate_synthetic_climatology.py` (synthetic, clearly source-tagged — see `docs/data-sources.md` for why case history isn't real yet), `load_county_boundaries.py` (real GADM geometry) |
| Task 4: Compartmental model | **Done** | `ml_service/app/compartmental.py` — rainfall-driven SEIR, `scipy.integrate.solve_ivp` + `scipy.optimize.least_squares`, used as Objective 2's benchmark. Separate from `app/simulation.py`, the interactive illustrative one behind the dashboard — that's unchanged |
| Task 5: ML model | **Done, honestly short of the 0.8 target** | `data/scripts/train_forecast_model.py` — XGBoost classifier+regressor, k-fold CV + held-out test, benchmarked against Task 4's SEIR. AUC 0.659 (target 0.8) on the full 14-county set, beats SEIR (0.519) and a climate-free baseline (0.567). See `docs/architecture.md`'s "Model results" for the honest why and the real fix (real data) |
| Task 6: Allocation module | **Done** | `allocation.py`'s LP wired to real stored forecasts via `ForecastGenerationService`/`AllocationGenerationService`, triggered for real from the dashboard (Generate Forecast / Run Allocation pages, token-authenticated). The documented corner-solution limitation now has a policy fix (`max_share_per_county`), exposed in the UI and verified live: doses spread across counties instead of concentrating in one |
| Task 7: Dashboard | **Done** | Charts, real-boundary map, paginated data tables (Case Reports/Forecasts/Allocations), CSV export, theming, responsive layout, case-report submission form, forecast/allocation trigger pages, county reference pages with per-county history, facility management, a chain-integrity verification page, and an expanded Analytics page (historical climate/case signal, seasonal rainfall, model performance, forecast-accuracy scatter, per-population KPIs) |
| Task 8: Testing & validation | **Done** | `backend/cases/tests.py` (41), `ml_service/tests/` (38), and a frontend suite (`frontend/src/**/*.test.{ts,tsx}`, Vitest — API-compatible with the proposal's named Jest, zero-config for this Vite/TS stack) (57) — 136 unit/integration tests total, all passing against real execution, not mocked-out happy paths alone. Plus `frontend/e2e/` (Playwright, `npm run test:e2e`) — a committed 18-test e2e suite against the real running stack: core flows (sign in → generate forecast → run allocation → verify chain) plus an axe-core accessibility regression check across every route, see `frontend/e2e/README.md`. `docs/uat_plan.md` is the Objective-5 instrument (task list, scoring sheet, 80%-completion formula) — the plan is built; running it needs real recruited participants this session doesn't have |

## What's left

Two real gaps, both blocked on something outside this codebase, not on
unwritten code:

1. **Real historical case data.** Objective 1's "5 years of monthly data"
   is currently a synthetic series driven by real CHIRPS rainfall, not
   observed case counts, because DHIS2/KEMRI access at that depth isn't
   available within this project's timeline (see `docs/data-sources.md`).
   Swapping it for the real thing needs no downstream changes — training,
   features, and forecasting all just read `HistoricalCaseData` regardless
   of its `source`.
2. **Actually running `docs/uat_plan.md`** with five real recruited
   end-users. The instrument is ready; this session has no users to run it
   with.

Smaller, genuinely optional next steps: real ERA5 (needs your Copernicus
CDS credentials — `generate_synthetic_climatology.py` is the honest
stand-in until then), self-registration (deliberately not built — this is
an internal tool, accounts are admin-managed), and splitting the frontend's
one large JS chunk if load time on a slow connection ever becomes a
complaint (`vite build`'s own warning, cosmetic today).
