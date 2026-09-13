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

**Frontend trigger UI is built** — `Generate Forecast` and `Run Allocation`
are their own nav-reachable pages (separate from the read-only `Forecasts`/
`Vaccine Allocation` list pages), gated on the token-auth flow in
`src/lib/auth.tsx` (`POST /api/auth/login/`, `Authorization: Token …`
header — no cookies, no CSRF dance, since the frontend is a cross-origin
SPA). Signed-out users see the form disabled with a "Sign in to run this"
prompt rather than the page simply not existing. `Run Allocation` also
exposes `max_share_per_county` (see the corner-solution note below) as a
plain percentage input.

## Upload & Simulate — bring-your-own-data compartmental fitting

`ml_service/app/upload_simulation.py` + `POST /simulate-upload` (multipart:
a CSV file, `population`, `horizon_months`) fits `app/compartmental.py`'s
SEIR model to a user-uploaded case series and projects it forward. Built on
SEIR rather than the trained XGBoost model deliberately: that model's
feature distribution (population scale, baseline rate) only means anything
for the 14 counties it was trained on (see "Model results" below), while an
SEIR calibration is a fresh per-dataset fit that works on any series it's
handed — no auth, no persistence, same "stateless what-if tool" spirit as
`/simulate`.

The real finding building this: a plain SEIR (permanent immunity, no
reinfection/import term) structurally cannot fit more than one seasonal
wave in a single calibration window — once a wave passes, the infectious
compartment decays toward zero with nothing to sustain a baseline case
count, so a full endemic year with several rises and falls fits badly
almost by construction (confirmed with real data, not assumed — see
`ml_service/tests/test_upload_simulation.py`'s multi-wave test). Rather than
fix that by changing `compartmental.py`'s core model — which would silently
change the already-reported SEIR benchmark numbers below — `simulate_upload`
computes a relative-RMSE fit-quality metric and surfaces a specific warning
explaining the mechanism when it's poor, with guidance to upload a shorter,
single-outbreak window instead. The frontend (`Upload & Simulate` in the
nav) shows this warning next to the chart, not just a number, plus a
downloadable template CSV shaped like the single-wave case this model
actually handles well.

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
docstring for why case history is synthetic while climate isn't) against 14
counties x 60 months (expanded from an initial 5-county pilot — see
`data/scripts/seed_counties.py`), a chronological 48/12-month train/test
split, 5-fold CV on the training set, evaluated on a held-out test set the
model never saw during training or calibration:

| | Accuracy | AUC | Sensitivity | Specificity |
|---|---|---|---|---|
| Climate-free baseline (case history + seasonality only) | 0.756 | 0.567 | 0.367 | 0.841 |
| **Full model** (+ rainfall/temperature/humidity) | 0.833 | **0.659** | 0.300 | 0.949 |
| SEIR compartmental benchmark | 0.726 | 0.519 | 0.133 | 0.855 |

Objective 2's AUC >= 0.8 target is **not met** (0.659) — reported as-is, not
tuned after the fact to cross the line. Objective 3's "measurable
improvement from climate variables" **is** demonstrated: +0.092 AUC over the
climate-free baseline, and the full model clearly outperforms the SEIR
benchmark as the objective's own benchmarking requirement asks.

Why 0.659 rather than 0.8, honestly: `confirmed_cases` is a synthetic series
(see `data/scripts/generate_synthetic_case_history.py`), generated with
genuine negative-binomial noise rather than a clean deterministic signal.
5-fold CV on the training set (0.674 mean AUC) and the held-out test set
(0.659) roughly agree, so it isn't overfit to one split. The rare positive
class (~17% outbreak-labeled months) is one structural reason AUC is hard
to push high regardless of model choice; expanding from 5 to 14 counties
actually *lowered* the number slightly (0.716 → 0.659) rather than raising
it, which is itself informative — the added counties span a much wider
transmission-intensity range (near-zero in urban Mombasa vs. high lake-
endemic burden in Siaya/Homa Bay), so the model now has to generalise
across a harder, more heterogeneous population instead of specialising to
a narrow 5-county pilot. That's a more honest test of Objective 1's
county-level scope even though the headline number went down. The real fix
either way is real data — DHIS2/KEMRI facility-level history at the depth
Objective 1 targets, once accessible (see `docs/data-sources.md`) — not
further hyperparameter search against a synthetic target.

Re-run: `data/scripts/train_forecast_model.py` (writes
`ml_service/models/forecast_metadata.json` with the full metrics + county
list + training window for reproducibility).

### Corner-solution behaviour, and the policy lever that addresses it

A pure linear objective (`sum(risk_score_i * doses_i)`) has a corner-solution
tendency: the solver will pour doses into the single highest-risk county up to
its population cap before allocating anything elsewhere, because linear returns
never diminish. That's a legitimate baseline and matches the proposal's citation
of sub-national prioritisation outperforming uniform rollout — it's still the
default (`max_share_per_county=1.0`) — but if you want allocation spread across
multiple high-risk counties, `AllocationRequest.max_share_per_county` (< 1.0)
caps any single county at that fraction of total doses. This is the
per-county-ceiling fix named below as the alternative to a nonlinear objective:
PuLP is a *linear* programming library, so `sqrt(doses_i)` isn't directly
expressible without a piecewise-linear approximation, whereas a ceiling is a
plain linear constraint. Exposed as a caller-chosen parameter (wired through
`AllocationGenerationService.generate` and the dashboard's Run Allocation page)
rather than a new hardcoded default, since concentration vs. spread is a policy
decision, not one `ml_service` should make unilaterally. See
`ml_service/app/allocation.py` and its tests for the mechanics.

## Frontend quality-of-life features

A handful of things added after the core app was working, worth a pointer
each rather than a full section:

- **Per-route code splitting** (`frontend/src/App.tsx`) — every page except
  Dashboard (the landing page, kept eager to avoid an extra round trip on
  first paint) is `React.lazy`-loaded, and `Dashboard`'s own `RiskMap`
  (Leaflet) is lazy too. `vite.config.ts` also splits `react`/`react-router`
  and `recharts` into their own vendor chunks. No chunk exceeds Vite's
  500KB warning after this (was one 800KB+ bundle before).
- **Configurable Decision Support thresholds** (`frontend/src/lib/
  settings.ts`, the Settings page) — the risk-band cutoffs, stale-forecast
  window, low-coverage %, and trend-noise % that turn raw numbers into
  "high risk" / "stale" / "under-covered" were hardcoded constants; they're
  now editable (Settings page, gated the same way other writes are — sign
  in required) and take effect everywhere those colors/labels appear
  (Dashboard, Forecasts, Decision Support, county detail). Stored in
  localStorage, same as the theme preference — this prototype has no
  multi-tenant backend config store to put it in instead.
- **PWA / offline support** (`vite.config.ts`'s `VitePWA` plugin,
  `components/OfflineBanner.tsx`) — a production build (`npm run build`)
  precaches the app shell and installs a service worker that also
  NetworkFirst-caches real GET `/api/...` responses, so a page you've
  already opened while online still renders — with an explicit "you're
  offline, showing last-loaded data" banner, never silently — after the
  connection drops. Verified against `vite preview`, not `vite dev`: Vite's
  dev server serves the module graph on demand rather than as a
  precacheable bundle, so the dev-mode service worker registers (useful for
  exercising `navigator.serviceWorker`/the banner day to day) but doesn't
  give a full offline reload the way the production build's precache
  manifest does.
- **A checked-in Playwright e2e suite** (`frontend/e2e/`, `npm run
  test:e2e`) — sign in → generate forecast → run allocation → verify
  chain, against the real running stack (not mocked), formalizing what had
  been ad hoc manual verification. See `frontend/e2e/README.md` and
  `backend/cases/management/commands/ensure_e2e_user.py` (the fixed
  dev/test-only user it signs in as).
- **Case-report corrections** (`CaseReport.supersedes`, the "Correct"
  action on Case Reports) — the model already had `supersedes` for filing a
  correction without editing history; `CaseReportService.create_report` now
  enforces that a correction targets the *current* (not-yet-superseded)
  version of a report and matches its county/facility/report_date, and the
  UI (`SubmitCaseReport`) has a correction mode that locks those three
  fields and pre-fills the rest.
- **Audit trail on generated forecasts/allocations**
  (`ForecastRun.generated_by` / `VaccineAllocation.generated_by`) — mirrors
  `CaseReport.reported_by`; who triggered a `/generate` call is now stored
  and shown (Forecasts/Allocations list a "Triggered by" column), where
  before only *that a run happened* was recorded, not who ran it.
- **Swahili localization** (`frontend/src/lib/i18n/`, the EN/SW switch in
  the topbar) — a plain key->string dictionary (no library; the vocabulary
  is small enough that one wouldn't add capability, just a dependency),
  persisted the same way the theme preference is. Deliberately scoped to
  navigation, chrome (buttons, banners), page headings, and shared
  table/KPI labels — what a user touches on every page — not yet the
  longer explanatory paragraphs, field hints, or error messages throughout
  the app, which is a much larger effort and lower priority than making
  primary navigation and actions usable in Swahili first. The translation
  itself (`lib/i18n/sw.ts`) is a first pass by an AI assistant with working
  but not native-level Swahili, not a professional translator — flagged in
  that file's own docstring as needing native-speaker review, the same
  "clearly labeled, not overclaimed" treatment this project gives synthetic
  data.
- **An accessibility pass** — an axe-core scan
  (`frontend/e2e/accessibility.spec.ts`, `@axe-core/playwright`, now a
  permanent regression check across every route) found and fixed several
  real issues: `--muted`/`--accent-text`/`--risk-low` were just under the
  4.5:1 AA text-contrast threshold (darkened slightly); a correction-row
  dimming effect (`.row-muted`) compounded `color` and `opacity` and fell
  well under threshold (now `color` alone); an empty `<th>` (the Case
  Reports "Correct" action column) had no accessible name; horizontally
  scrollable tables (`.table-scroll`) weren't keyboard-reachable when their
  content had no other focusable element (`tabIndex`/`role="region"`/
  `aria-label` added); and Chain Integrity had a heading-level skip (h2 ->
  h4). Also added: a "Skip to main content" link, visible on keyboard focus
  (`App.tsx`, `.skip-link`). Axe catches roughly a third of real
  accessibility issues (per its own documentation) — real coverage still
  needs a manual pass (screen reader, keyboard-only navigation), which this
  isn't a substitute for.
