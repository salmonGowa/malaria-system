"""Vaccine allocation optimisation module.

Unlike forecasting.py, this one is a real implementation, not a stub — the
allocation problem only needs risk scores and population as inputs, both of
which the request already carries, so there's no reason to wait for the trained
forecasting model to build it.

Approach: maximise total expected cases averted, approximated as
sum(risk_score_i * doses_i), subject to:
  - total doses allocated <= total available doses
  - doses to county i <= that county's at-risk population (can't over-allocate)

This directly follows the sub-national, risk-weighted prioritisation strategy
shown to outperform uniform national rollout in Hogan, Winskill & Ghani (2020),
which the proposal cites as its motivating study. It's a linear relaxation of
what is technically an integer allocation problem; doses are rounded down after
solving, which is fine at the scale (thousands of doses) this operates at.
"""

import pulp

from app.schemas import AllocationLine, AllocationRequest, AllocationResponse


def optimise_allocation(request: AllocationRequest) -> AllocationResponse:
    counties = [f.county_code for f in request.county_forecasts]
    risk_by_county = {f.county_code: f.risk_score for f in request.county_forecasts}
    population_by_county = request.county_populations

    problem = pulp.LpProblem("vaccine_allocation", pulp.LpMaximize)

    doses = {
        code: pulp.LpVariable(f"doses_{code}", lowBound=0, cat="Continuous") for code in counties
    }

    # Objective: maximise risk-weighted doses allocated.
    problem += pulp.lpSum(risk_by_county[code] * doses[code] for code in counties)

    # Total doses constraint.
    problem += pulp.lpSum(doses[code] for code in counties) <= request.total_available_doses

    # Can't allocate more doses than the at-risk population in a county.
    for code in counties:
        cap = population_by_county.get(code)
        if cap is not None:
            problem += doses[code] <= cap

    problem.solve(pulp.PULP_CBC_CMD(msg=False))

    allocations = []
    total_allocated = 0
    for code in counties:
        recommended = int(doses[code].value() or 0)
        total_allocated += recommended
        allocations.append(
            AllocationLine(
                county_code=code,
                recommended_doses=recommended,
                rationale=(
                    f"Risk score {risk_by_county[code]:.2f}; allocation maximises "
                    f"risk-weighted coverage under the {request.total_available_doses}-dose constraint, "
                    f"capped at the county's at-risk population."
                ),
            )
        )

    return AllocationResponse(
        total_available_doses=request.total_available_doses,
        total_allocated_doses=total_allocated,
        allocations=allocations,
    )
