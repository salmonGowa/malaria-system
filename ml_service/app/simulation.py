"""Outbreak simulation module — ILLUSTRATIVE, not a forecast.

Compartmental models driven by user-supplied parameters, behind the
dashboard's interactive "what happens if transmission or intervention
coverage changes" explorer. Not the trained forecasting model (see
app/forecasting.py), and not fit to any observed outbreak — though the
dashboard can *start* it from a county's real population, current cases and
rainfall pattern (the Django backend's simulation-start endpoint). The
transmission rate always stays the user's assumption.

Two models:

- "seir" (default) — human-only SEIR with a constant (or rainfall-seasonal)
  transmission rate beta. With every optional field left at its default this
  is exactly the original constant-beta model, step for step.
- "vector" — Ross-Macdonald: human SEIR + mosquito SEI. Mosquito density is
  calibrated so R0 matches the SEIR at the same transmission_rate, so the two
  models agree when nothing intervenes. Interventions (nets, indoor spraying)
  cut the biting rate, which enters transmission twice (mosquito->human and
  human->mosquito), so in this model coverage reduces R0 by (1 - c)^2 rather
  than (1 - c) — the standard reason vector control is so effective.

Optional, all off by default: interventions starting at a given week,
rainfall-driven seasonality (1-month lag, the same response curve
app/compartmental.py fits), a vaccine-protected share of the population, and
an uncertainty band (the envelope of transmission x0.8, x1 and x1.2).

Do not present this model's output as a prediction. Every response carries a
disclaimer field for exactly that reason — surface it in the UI.
"""
import math

from app.schemas import SimulationBandWeek, SimulationRequest, SimulationResponse, SimulationWeek

STEPS_PER_DAY = 1
DAYS_PER_WEEK = 7
DAYS_PER_MONTH = 365.25 / 12
RAINFALL_SCALE_MM = 40.0  # same "typical monthly rainfall" scale as app/compartmental.py
UNCERTAINTY_SCALES = (0.8, 1.2)

# Ross-Macdonald vector parameters — literature-typical values for Anopheles
# gambiae in East Africa (biting rate, transmission probabilities per bite,
# ~10-day adult lifespan, ~10-day extrinsic incubation period).
BITING_RATE = 0.3  # bites per mosquito per day (a)
P_MOSQUITO_TO_HUMAN = 0.5  # b
P_HUMAN_TO_MOSQUITO = 0.5  # c
MOSQUITO_DEATH_RATE = 0.1  # per day (g)
EXTRINSIC_INCUBATION_DAYS = 10.0  # n
VECTOR_SUBSTEPS = 4  # the mosquito equations are stiffer; integrate in 6-hour steps

VECTOR_DISCLAIMER = (
    "Illustrative Ross-Macdonald model (humans + mosquitoes) with literature-typical vector "
    "parameters and user-supplied settings — not the trained, data-fitted forecasting model "
    "(Module 2). For exploring intervention trade-offs only, not for operational decisions."
)


def _seasonal_multipliers(request: SimulationRequest):
    """Per-calendar-month transmission multipliers (index 0 = January),
    normalised to average 1 over the year. Each month is driven by the
    previous month's rainfall."""
    rain = request.seasonal_rainfall_mm
    if not rain:
        return None
    raw = [1.0 + request.rainfall_sensitivity * math.log1p(max(rain[(m - 1) % 12], 0.0) / RAINFALL_SCALE_MM) for m in range(12)]
    mean = sum(raw) / 12
    return [r / mean for r in raw]


def _month_of_day(request: SimulationRequest, day: int) -> int:
    return (request.start_month - 1 + int(day // DAYS_PER_MONTH)) % 12


def _run(request: SimulationRequest, beta_scale: float = 1.0):
    """Simulate. Returns (weeks, peak_week, peak_infectious, total_cases)."""
    n = request.population
    sigma = 1.0 / request.incubation_period_days  # exposed -> infectious rate
    gamma = 1.0 / request.infectious_period_days  # infectious -> recovered rate
    beta = request.transmission_rate * beta_scale
    seasonal = _seasonal_multipliers(request)
    start_day = request.intervention_start_week * DAYS_PER_WEEK

    infectious = float(request.initial_infectious)
    exposed = 0.0
    protected = request.vaccine_protected_fraction * (float(n) - infectious)
    recovered = protected  # vaccine-protected people start in the immune compartment
    susceptible = float(n) - infectious - exposed - protected

    # Vector model state: mosquito fractions (susceptible / exposed / infectious)
    # and density m, calibrated so R0 equals the SEIR's beta/gamma.
    survive_eip = math.exp(-MOSQUITO_DEATH_RATE * EXTRINSIC_INCUBATION_DAYS)
    m_density = beta * MOSQUITO_DEATH_RATE / (BITING_RATE**2 * P_MOSQUITO_TO_HUMAN * P_HUMAN_TO_MOSQUITO * survive_eip)
    sv, ev, iv = 1.0, 0.0, 0.0

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
    day = 0

    for week in range(1, request.horizon_weeks + 1):
        new_cases_this_week = 0.0
        for _ in range(DAYS_PER_WEEK):
            coverage = request.intervention_coverage if day >= start_day else 0.0
            season = seasonal[_month_of_day(request, day)] if seasonal else 1.0

            if request.model == "vector":
                biting = BITING_RATE * (1.0 - coverage)
                dt = 1.0 / VECTOR_SUBSTEPS
                for _sub in range(VECTOR_SUBSTEPS):
                    force_on_humans = m_density * season * biting * P_MOSQUITO_TO_HUMAN * iv
                    force_on_mosquitoes = biting * P_HUMAN_TO_MOSQUITO * (infectious / n)
                    new_infections = force_on_humans * susceptible * dt
                    new_infectious = sigma * exposed * dt
                    new_recoveries = gamma * infectious * dt

                    susceptible -= new_infections
                    exposed += new_infections - new_infectious
                    infectious += new_infectious - new_recoveries
                    recovered += new_recoveries
                    susceptible, exposed, infectious = max(susceptible, 0.0), max(exposed, 0.0), max(infectious, 0.0)

                    # Mosquito births replace deaths (stable population); exposed
                    # mosquitoes become infectious after the extrinsic incubation.
                    new_ev = force_on_mosquitoes * sv * dt
                    ev_to_iv = ev / EXTRINSIC_INCUBATION_DAYS * dt
                    sv += MOSQUITO_DEATH_RATE * dt * (1.0 - sv) - new_ev
                    ev += new_ev - ev_to_iv - MOSQUITO_DEATH_RATE * ev * dt
                    iv += ev_to_iv - MOSQUITO_DEATH_RATE * iv * dt
                    sv, ev, iv = max(sv, 0.0), max(ev, 0.0), max(iv, 0.0)

                    new_cases_this_week += new_infectious
            else:
                beta_eff = beta * season * (1.0 - coverage)
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
            day += 1

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

    return weeks, peak_week, peak_infectious, total_projected_cases


def _reproduction_numbers(request: SimulationRequest):
    """R at week 0 without interventions, and once interventions are in place
    (both at the starting month's seasonal level, with vaccine protection)."""
    gamma = 1.0 / request.infectious_period_days
    seasonal = _seasonal_multipliers(request)
    season = seasonal[request.start_month - 1] if seasonal else 1.0
    susceptible_share = 1.0 - request.vaccine_protected_fraction
    r0 = request.transmission_rate * season / gamma * susceptible_share
    reduction = (1.0 - request.intervention_coverage) ** (2 if request.model == "vector" else 1)
    return r0, r0 * reduction


def simulate_outbreak(request: SimulationRequest) -> SimulationResponse:
    weeks, peak_week, peak_infectious, total_projected_cases = _run(request)
    r_initial, r_with = _reproduction_numbers(request)

    extra = {}
    if request.uncertainty:
        low_weeks, *_rest, low_total = _run(request, UNCERTAINTY_SCALES[0])
        high_weeks, *_rest2, high_total = _run(request, UNCERTAINTY_SCALES[1])
        extra = {
            # Envelope across all three runs, week by week: a lower rate also
            # *delays* the outbreak, so late on the "low" run can have more
            # infections than the central one — min/max, not low/high runs.
            "band": [
                SimulationBandWeek(
                    week=mid.week,
                    infectious_low=min(lo.infectious, mid.infectious, hi.infectious),
                    infectious_high=max(lo.infectious, mid.infectious, hi.infectious),
                )
                for lo, mid, hi in zip(low_weeks, weeks, high_weeks)
            ],
            "total_cases_low": min(low_total, total_projected_cases, high_total),
            "total_cases_high": max(low_total, total_projected_cases, high_total),
        }

    response = SimulationResponse(
        weeks=weeks,
        peak_week=peak_week,
        peak_infectious=peak_infectious,
        total_projected_cases=total_projected_cases,
        r_initial=r_initial,
        r_with_interventions=r_with,
        **extra,
    )
    if request.model == "vector":
        response.model_name = "illustrative_vector"
        response.disclaimer = VECTOR_DISCLAIMER
    return response
