# Roadmap

Mapped to the proposal's Chapter 1.10 schedule. This scaffold covers the
repo/schema groundwork that sits underneath Tasks 1-2; everything below is
still ahead of you.

| Proposal task | What it needs, concretely | Depends on |
|---|---|---|
| Task 3: Data collection & preprocessing | Get MAP case data + CHIRPS/ERA5 climate data into the DB for 2-3 pilot counties (see `docs/data-sources.md`); write `data/scripts/aggregate_climate.py` | This scaffold's models |
| Task 4: Compartmental model | SEIR (or SEIR + mosquito vector compartments) in `ml_service/app/`, solved with `scipy.integrate.odeint`/`solve_ivp`; used as the forecasting benchmark named in 3.4 | Task 3 data |
| Task 5: ML model | Replace `naive_forecast()` in `ml_service/app/forecasting.py` with a trained XGBoost (or Random Forest) model per Khan/Ajadi/Hossain 2024 methodology; cross-validate, compare to SEIR baseline | Task 3 data |
| Task 6: Allocation module | Already implemented (`ml_service/app/allocation.py`) — wire it to real forecasts instead of request-supplied risk scores; add a Django endpoint that calls `ml_service` and stores a `VaccineAllocation` | Task 5 model |
| Task 7: Dashboard | Charts for case trends and risk (a line/bar chart library — recharts or similar — isn't installed yet), forms for case-report submission, allocation trigger UI | Task 6 |
| Task 8: Testing & validation | Extend `backend/cases/tests.py`; add `ml_service` tests (Pytest) for the forecast/allocation endpoints; k-fold CV reporting for the trained model | All above |

## Immediate next actions (in order)

1. Run `docker compose up --build`, confirm all four services come up, run
   migrations, create a superuser, add a couple of counties via `/admin/`.
2. Pick 2-3 pilot counties (lake-region or coastal, per the proposal's scope) and
   pull their MAP + CHIRPS/ERA5 data manually first, before automating — confirms
   the data actually looks reasonable before building a pipeline around it.
3. `data/scripts/aggregate_climate.py` to load that into `ClimateObservation`.
4. SEIR baseline in `ml_service` — gives you Task 4's deliverable and a benchmark
   for Task 5.

Ask when you're ready for any of these — the SEIR model and the climate
aggregation script are both good next pieces to build now that the scaffold runs.
