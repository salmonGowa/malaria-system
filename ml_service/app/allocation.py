"""Vaccine allocation optimisation module.

Unlike forecasting.py, this one is a real implementation, not a stub — the
allocation problem only needs risk scores and population as inputs, both of
which the request already carries, so there's no reason to wait for the trained
forecasting model to build it.

Approach: maximise total expected cases averted, approximated as
sum(risk_score_i * doses_i), subject to:
  - total doses allocated <= total available doses
  - doses to county i <= that county's at-risk population (can't over-allocate)
  - doses to county i <= max_share_per_county * total_available_doses (optional
    policy ceiling — see below)

This directly follows the sub-national, risk-weighted prioritisation strategy
shown to outperform uniform national rollout in Hogan, Winskill & Ghani (2020),
which the proposal cites as its motivating study. It's a linear relaxation of
what is technically an integer allocation problem; doses are rounded down after
solving, which is fine at the scale (thousands of doses) this operates at.

On the corner-solution behaviour (docs/architecture.md's "Known limitation"):
a purely linear objective has no diminishing returns, so left unconstrained the
solver pours every dose into the single highest-risk county up to its
population cap before allocating anything else. That's still the default here
(max_share_per_county=1.0) because it's a legitimate baseline, not a bug — but
`max_share_per_county` below 1.0 is the documented, simplest fix: a per-county
ceiling as a policy constraint, which is exactly what the architecture doc
proposed as the alternative to a nonlinear (sqrt) objective PuLP can't express
directly. Left as a caller-chosen parameter rather than a new hardcoded default
because whether concentration or spread is the right call is a policy decision,
not one this module should make unilaterally.
"""

import pulp

from app.schemas import AllocationLine, AllocationRequest, AllocationResponse


def optimise_allocation(request: AllocationRequest) -> AllocationResponse:
    counties = [f.county_code for f in request.county_forecasts]
    risk_by_county = {f.county_code: f.risk_score for f in request.county_forecasts}
    population_by_county = request.county_populations
    share_cap = request.max_share_per_county * request.total_available_doses

    problem = pulp.LpProblem("vaccine_allocation", pulp.LpMaximize)

    doses = {
        code: pulp.LpVariable(f"doses_{code}", lowBound=0, cat="Continuous") for code in counties
    }

    # Objective: maximise risk-weighted doses allocated.
    problem += pulp.lpSum(risk_by_county[code] * doses[code] for code in counties)

    # Total doses constraint.
    problem += pulp.lpSum(doses[code] for code in counties) <= request.total_available_doses

    # Equity floor — each county's minimum, never above its own population.
    floors = {
        code: min(request.min_doses_per_county, population_by_county[code])
        if population_by_county.get(code) is not None
        else request.min_doses_per_county
        for code in counties
    }
    if sum(floors.values()) > request.total_available_doses:
        raise ValueError(
            f"A floor of {request.min_doses_per_county:,} doses per county needs {sum(floors.values()):,} doses, "
            f"more than the {request.total_available_doses:,} available."
        )

    for code in counties:
        # Can't allocate more doses than the at-risk population in a county.
        cap = population_by_county.get(code)
        if cap is not None:
            problem += doses[code] <= cap
        if floors[code] > 0:
            problem += doses[code] >= floors[code]
        # Optional policy ceiling — see module docstring. A no-op at the
        # default max_share_per_county=1.0 (share_cap == total_available_doses,
        # never tighter than the total-doses constraint above).
        if request.max_share_per_county < 1.0:
            problem += doses[code] <= share_cap

    problem.solve(pulp.PULP_CBC_CMD(msg=False))

    allocations = []
    total_allocated = 0
    for code in counties:
        recommended = int(doses[code].value() or 0)
        total_allocated += recommended
        rationale = (
            f"Risk score {risk_by_county[code]:.2f}; allocation maximises "
            f"risk-weighted coverage under the {request.total_available_doses}-dose constraint, "
            f"capped at the county's at-risk population"
        )
        if request.max_share_per_county < 1.0:
            rationale += f" and at {request.max_share_per_county:.0%} of total doses ({int(share_cap)})"
        if floors[code] > 0:
            rationale += f", with a guaranteed minimum of {floors[code]:,}"
        allocations.append(AllocationLine(county_code=code, recommended_doses=recommended, rationale=rationale + "."))

    return AllocationResponse(
        total_available_doses=request.total_available_doses,
        total_allocated_doses=total_allocated,
        allocations=allocations,
    )
