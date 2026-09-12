"""Self-consistency tests for app/compartmental.py: simulate a series with
known parameters, then confirm fit_county recovers parameters that reproduce
it — the strongest test available for a calibration routine without a real
outbreak dataset to fit against."""
import numpy as np

from app import compartmental as cm


def test_simulate_months_stays_within_physical_bounds():
    params = cm.SEIRParams(beta0=0.4, k=1.5, reporting_fraction=0.03)
    population = 1_000_000
    initial_state = (population - 100.0, 0.0, 100.0, 0.0)
    rainfall = [20, 40, 80, 120, 90, 30]

    monthly_cases, final_state = cm._simulate_months(params, initial_state, rainfall)

    assert all(np.isfinite(c) for c in monthly_cases)
    assert all(c >= 0 for c in monthly_cases)
    assert all(c < population for c in monthly_cases)
    assert all(np.isfinite(s) and s >= 0 for s in final_state)


def test_fit_county_recovers_the_generating_series():
    rng_rainfall = [20, 40, 80, 120, 90, 30, 10, 15, 25, 60, 100, 70] * 2  # 24 months
    true_params = cm.SEIRParams(beta0=0.4, k=1.5, reporting_fraction=0.03)
    population = 1_000_000
    i0 = 100.0
    initial_state = (population - i0, 0.0, i0, 0.0)

    observed, _ = cm._simulate_months(true_params, initial_state, rng_rainfall)

    fitted = cm.fit_county(population, rng_rainfall, observed, initial_infectious_frac=i0 / population)
    refit, _ = cm._simulate_months(fitted, initial_state, rng_rainfall)

    mae = float(np.mean(np.abs(np.array(refit) - np.array(observed))))
    assert mae < 0.05 * np.mean(observed)


def test_forecast_produces_bounded_finite_values():
    params = cm.SEIRParams(beta0=0.35, k=1.2, reporting_fraction=0.02)
    population = 500_000
    rainfall = [30, 50, 70]
    recent_cases = [800.0, 900.0, 1000.0]

    forecasted = cm.forecast(params, population, rainfall, recent_cases)

    assert len(forecasted) == len(rainfall)
    assert all(np.isfinite(v) and v >= 0 for v in forecasted)
    assert all(v < population for v in forecasted)


def test_fit_county_rejects_too_short_a_series():
    import pytest

    with pytest.raises(ValueError):
        cm.fit_county(100000, [10, 20], [5, 10])
