"""Outbreak simulation module — ILLUSTRATIVE, not a forecast.

This is a generic SEIR (Susceptible-Exposed-Infectious-Recovered) compartmental
model driven entirely by user-supplied parameters. It has no connection to real
case, climate, or facility data, and is not fit to any observed outbreak — it
exists so the dashboard can offer an interactive "what happens if transmission
or intervention coverage changes" exploration tool while Module 2's trained,
data-fitted forecasting model (see app/forecasting.py) doesn't exist yet.

Do not present this model's output as a prediction. Every response carries a
disclaimer field for exactly that reason — surface it in the UI.
"""

from app.schemas import SimulationRequest, SimulationResponse, SimulationWeek

STEPS_PER_DAY = 1
DAYS_PER_WEEK = 7


def simulate_outbreak(request: SimulationRequest) -> SimulationResponse:
    n = request.population
    sigma = 1.0 / request.incubation_period_days  # exposed -> infectious rate
    gamma = 1.0 / request.infectious_period_days  # infectious -> recovered rate
    beta_eff = request.transmission_rate * (1.0 - request.intervention_coverage)

    infectious = float(request.initial_infectious)
    exposed = 0.0
    recovered = 0.0
    susceptible = float(n) - infectious - exposed

    weeks: list[SimulationWeek] = [
        SimulationWeek(
            week=0,
            susceptible=susceptible,
            exposed=exposed,
            infectious=infectious,
            recovered=recovered,
            new_cases=infectious,
        )
    ]

    total_projected_cases = infectious
    peak_infectious = infectious
    peak_week = 0

    for week in range(1, request.horizon_weeks + 1):
        new_cases_this_week = 0.0
        for _ in range(DAYS_PER_WEEK):
            new_infections = beta_eff * susceptible * infectious / n
            new_infectious = sigma * exposed
            new_recoveries = gamma * infectious

            susceptible -= new_infections
            exposed += new_infections - new_infectious
            infectious += new_infectious - new_recoveries
            recovered += new_recoveries

            # Numerical guard: a coarse daily step can overshoot near-zero
            # compartments and drift slightly negative — clamp rather than let
            # that propagate into the next step.
            susceptible = max(susceptible, 0.0)
            exposed = max(exposed, 0.0)
            infectious = max(infectious, 0.0)

            new_cases_this_week += new_infectious

        total_projected_cases += new_cases_this_week
        if infectious > peak_infectious:
            peak_infectious = infectious
            peak_week = week

        weeks.append(
            SimulationWeek(
                week=week,
                susceptible=susceptible,
                exposed=exposed,
                infectious=infectious,
                recovered=recovered,
                new_cases=new_cases_this_week,
            )
        )

    return SimulationResponse(
        weeks=weeks,
        peak_week=peak_week,
        peak_infectious=peak_infectious,
        total_projected_cases=total_projected_cases,
    )
