"""Tests for app/allocation.py — the real (non-placeholder) optimisation
module. Untested until now despite being production logic."""
from app.allocation import optimise_allocation
from app.schemas import AllocationRequest, ForecastResponse


def _forecast(county_code, risk_score):
    return ForecastResponse(
        county_code=county_code,
        forecast_period_start="2026-05-01",
        forecast_period_end="2026-05-28",
        predicted_cases=0.0,
        risk_score=risk_score,
        model_name="test",
        model_version="test",
    )


def test_allocates_all_doses_when_population_caps_allow():
    request = AllocationRequest(
        total_available_doses=1000,
        county_forecasts=[_forecast("A", 0.9), _forecast("B", 0.5)],
        county_populations={"A": 10000, "B": 10000},
    )
    result = optimise_allocation(request)
    assert result.total_allocated_doses == 1000
    assert result.total_available_doses == 1000


def test_prioritises_higher_risk_county_first():
    """A linear objective (sum(risk_i * doses_i)) should exhaust the highest-risk
    county's population cap before allocating anything elsewhere — the documented
    corner-solution behaviour in docs/architecture.md."""
    request = AllocationRequest(
        total_available_doses=5000,
        county_forecasts=[_forecast("HIGH", 0.9), _forecast("LOW", 0.1)],
        county_populations={"HIGH": 3000, "LOW": 10000},
    )
    result = optimise_allocation(request)
    by_code = {a.county_code: a.recommended_doses for a in result.allocations}
    assert by_code["HIGH"] == 3000  # capped at its population, gets it all first
    assert by_code["LOW"] == 2000  # remainder goes to the only other county


def test_never_exceeds_population_cap():
    request = AllocationRequest(
        total_available_doses=100000,
        county_forecasts=[_forecast("A", 0.9)],
        county_populations={"A": 5000},
    )
    result = optimise_allocation(request)
    assert result.allocations[0].recommended_doses <= 5000


def test_county_with_no_population_cap_is_uncapped():
    request = AllocationRequest(
        total_available_doses=1000,
        county_forecasts=[_forecast("A", 0.5)],
        county_populations={},  # no cap given for A
    )
    result = optimise_allocation(request)
    assert result.allocations[0].recommended_doses == 1000


def test_max_share_per_county_spreads_allocation():
    """The documented fix for the corner-solution behaviour: capping any one
    county at a fraction of total doses forces spread across multiple
    high-risk counties instead of concentrating in the single highest one."""
    request = AllocationRequest(
        total_available_doses=5000,
        county_forecasts=[_forecast("HIGH", 0.9), _forecast("MID", 0.6), _forecast("LOW", 0.1)],
        county_populations={"HIGH": 100000, "MID": 100000, "LOW": 100000},
        max_share_per_county=0.4,
    )
    result = optimise_allocation(request)
    by_code = {a.county_code: a.recommended_doses for a in result.allocations}

    # No county exceeds 40% of the 5000-dose total.
    assert all(doses <= 2000 for doses in by_code.values())
    # Still risk-ordered: higher risk still gets at least as much as lower risk.
    assert by_code["HIGH"] >= by_code["MID"] >= by_code["LOW"]
    # All doses still get allocated (three counties can absorb the ceiling
    # 3 x 2000 = 6000 >= 5000 total).
    assert result.total_allocated_doses == 5000
    assert "40%" in result.allocations[0].rationale


def test_max_share_per_county_default_preserves_original_behaviour():
    """Explicitly pinning the default (1.0) reproduces the unconstrained
    corner-solution result — the ceiling is opt-in, not a silent behaviour
    change for existing callers."""
    request = AllocationRequest(
        total_available_doses=5000,
        county_forecasts=[_forecast("HIGH", 0.9), _forecast("LOW", 0.1)],
        county_populations={"HIGH": 3000, "LOW": 10000},
        max_share_per_county=1.0,
    )
    result = optimise_allocation(request)
    by_code = {a.county_code: a.recommended_doses for a in result.allocations}
    assert by_code["HIGH"] == 3000
    assert by_code["LOW"] == 2000


def test_equity_floor_guarantees_every_county_a_minimum():
    from app.schemas import AllocationRequest

    request = AllocationRequest(
        total_available_doses=1000,
        county_forecasts=[_forecast("A", 0.9), _forecast("B", 0.1), _forecast("C", 0.05)],
        county_populations={"A": 10_000, "B": 10_000, "C": 50},
        min_doses_per_county=100,
    )
    by_code = {line.county_code: line.recommended_doses for line in optimise_allocation(request).allocations}
    assert by_code["B"] >= 100
    assert by_code["C"] == 50  # floor capped at the county's own population
    assert by_code["A"] == 1000 - by_code["B"] - by_code["C"]


def test_equity_floor_the_supply_cannot_cover_is_rejected():
    import pytest
    from app.schemas import AllocationRequest

    request = AllocationRequest(
        total_available_doses=100,
        county_forecasts=[_forecast("A", 0.9), _forecast("B", 0.1)],
        county_populations={"A": 10_000, "B": 10_000},
        min_doses_per_county=80,
    )
    with pytest.raises(ValueError):
        optimise_allocation(request)
