"""Scenario behaviour of the interactive simulator (app/simulation.py):
intervention timing, vaccine protection, seasonality and model agreement."""
from app.schemas import SimulationRequest
from app.simulation import simulate_outbreak

BASE = dict(population=500_000, initial_infectious=50, transmission_rate=0.35, horizon_weeks=52)


def run(**kw):
    return simulate_outbreak(SimulationRequest(**{**BASE, **kw}))


def test_acting_later_means_more_cases():
    early = run(intervention_coverage=0.6, intervention_start_week=0)
    late = run(intervention_coverage=0.6, intervention_start_week=10)
    assert late.total_projected_cases > early.total_projected_cases
    assert late.peak_infectious > early.peak_infectious


def test_start_week_zero_equals_original_behaviour():
    assert run(intervention_coverage=0.4).weeks == run(intervention_coverage=0.4, intervention_start_week=0).weeks


def test_vaccine_protection_reduces_cases_and_r():
    none, some = run(), run(vaccine_protected_fraction=0.3)
    assert some.total_projected_cases < none.total_projected_cases
    assert abs(some.r_initial - none.r_initial * 0.7) < 1e-9


def test_vector_and_seir_share_r0_without_interventions():
    assert abs(run(model="vector").r_initial - run().r_initial) < 1e-9


def test_vector_model_responds_more_strongly_to_nets():
    seir, vector = run(intervention_coverage=0.5), run(model="vector", intervention_coverage=0.5)
    assert vector.r_with_interventions < seir.r_with_interventions
    assert vector.total_projected_cases < seir.total_projected_cases


def test_seasonality_redistributes_rather_than_inflates():
    flat_rain = [80.0] * 12
    # A flat rainfall year is the same as no seasonality at all.
    assert abs(run(seasonal_rainfall_mm=flat_rain).total_projected_cases - run().total_projected_cases) < 1e-6
    wet_start = run(seasonal_rainfall_mm=[20, 20, 200, 200, 200, 20, 20, 20, 20, 20, 20, 20], start_month=3, horizon_weeks=8)
    dry_start = run(seasonal_rainfall_mm=[20, 20, 200, 200, 200, 20, 20, 20, 20, 20, 20, 20], start_month=8, horizon_weeks=8)
    assert wet_start.total_projected_cases > dry_start.total_projected_cases


def test_uncertainty_band_brackets_the_central_run():
    r = run(uncertainty=True, horizon_weeks=20)
    for mid, b in zip(r.weeks, r.band):
        assert b.infectious_low <= mid.infectious + 1e-9 <= b.infectious_high + 2e-9
