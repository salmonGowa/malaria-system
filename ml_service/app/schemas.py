from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ForecastRequest(BaseModel):
    county_code: str = Field(..., description="County code, e.g. KEN-042")
    as_of_date: date = Field(..., description="Forecast is generated using data up to this date")
    horizon_weeks: int = Field(4, ge=1, le=26)
    population: int | None = Field(None, description="County population, used as a log-scaled feature")
    recent_confirmed_cases: list[float] = Field(
        default_factory=list,
        description=(
            "Monthly confirmed case counts, oldest first, ending the month before as_of_date's month. "
            "ml_service has no database of its own (see docs/architecture.md) — the caller (Django) "
            "gathers this. Needs >= 3 months for the trained model to compute lag features."
        ),
    )
    recent_rainfall_mm: list[float] = Field(
        default_factory=list,
        description="Monthly rainfall (mm), same window/ordering as recent_confirmed_cases.",
    )
    recent_temperature_c: list[float] = Field(
        default_factory=list, description="Monthly mean temperature (C), same window/ordering. Optional."
    )
    recent_humidity_pct: list[float] = Field(
        default_factory=list, description="Monthly mean relative humidity (%), same window/ordering. Optional."
    )


class ForecastResponse(BaseModel):
    county_code: str
    forecast_period_start: date
    forecast_period_end: date
    predicted_cases: float
    risk_score: float = Field(..., ge=0, le=1)
    model_name: str
    model_version: str


class AllocationRequest(BaseModel):
    total_available_doses: int = Field(..., gt=0)
    county_forecasts: list[ForecastResponse]
    county_populations: dict[str, int] = Field(
        ..., description="county_code -> at-risk population, used alongside risk_score"
    )
    max_share_per_county: float = Field(
        1.0,
        gt=0,
        le=1,
        description=(
            "Cap any single county at this fraction of total_available_doses. Default 1.0 (no "
            "cap) preserves the original behaviour: with a purely linear objective, the solver "
            "pours doses into the single highest-risk county up to its population cap before "
            "allocating anything else (see docs/architecture.md's 'Known limitation'). Setting "
            "this below 1.0 is the documented fix — a policy constraint that forces spread "
            "across multiple high-risk counties instead of concentrating in one."
        ),
    )
    min_doses_per_county: int = Field(
        0,
        ge=0,
        description=(
            "Equity floor: every county gets at least this many doses (or its whole at-risk "
            "population, if smaller), before the risk-weighted objective distributes the rest. "
            "Rejected if the floors alone exceed the supply."
        ),
    )


class AllocationLine(BaseModel):
    county_code: str
    recommended_doses: int
    rationale: str


class AllocationResponse(BaseModel):
    total_available_doses: int
    total_allocated_doses: int
    allocations: list[AllocationLine]


class SimulationRequest(BaseModel):
    population: int = Field(..., gt=0)
    initial_infectious: int = Field(10, ge=0, description="People infectious at week 0")
    transmission_rate: float = Field(
        0.30, gt=0, le=2, description="Base transmission rate (beta), before intervention effect"
    )
    incubation_period_days: float = Field(10, gt=0, description="Mean days from exposed to infectious")
    infectious_period_days: float = Field(14, gt=0, description="Mean days a case remains infectious")
    intervention_coverage: float = Field(
        0.0, ge=0, le=1, description="Fraction reduction in transmission from bed nets/IRS/etc"
    )
    horizon_weeks: int = Field(24, ge=1, le=104)

    # Everything below defaults to "off" — a request without these fields
    # behaves exactly as the original constant-transmission SEIR did.
    model: Literal["seir", "vector"] = Field(
        "seir",
        description=(
            "'seir' — human-only SEIR with transmission_rate as beta. 'vector' — Ross-Macdonald "
            "human SEIR + mosquito SEI, with mosquito density calibrated so its R0 matches the "
            "SEIR's at the same transmission_rate; interventions cut the biting rate, so they "
            "act on transmission twice (mosquito-to-human and human-to-mosquito)."
        ),
    )
    intervention_start_week: int = Field(
        0, ge=0, le=104, description="Week interventions take effect; 0 = in place from the start."
    )
    vaccine_protected_fraction: float = Field(
        0.0, ge=0, le=1, description="Share of the population protected (by vaccination) from week 0."
    )
    seasonal_rainfall_mm: list[float] | None = Field(
        None,
        min_length=12,
        max_length=12,
        description=(
            "Mean rainfall for each calendar month, Jan..Dec. When given, transmission follows "
            "the rains (1-month lag, same response curve as app/compartmental.py), normalised "
            "so the year-average equals transmission_rate — seasons redistribute transmission "
            "across the year rather than inflate it."
        ),
    )
    rainfall_sensitivity: float = Field(1.0, ge=0, le=15, description="k in beta * (1 + k*log1p(rain/40)).")
    start_month: int = Field(1, ge=1, le=12, description="Calendar month (1-12) that week 0 falls in.")
    uncertainty: bool = Field(False, description="Also return a band from transmission_rate x0.8 and x1.2.")


class SimulationWeek(BaseModel):
    week: int
    susceptible: float
    exposed: float
    infectious: float
    recovered: float
    new_cases: float


class SimulationBandWeek(BaseModel):
    week: int
    infectious_low: float
    infectious_high: float


class SimulationResponse(BaseModel):
    weeks: list[SimulationWeek]
    peak_week: int
    peak_infectious: float
    total_projected_cases: float
    r_initial: float | None = None  # reproduction number at week 0, before interventions
    r_with_interventions: float | None = None  # ...once interventions are in place
    band: list[SimulationBandWeek] | None = None
    total_cases_low: float | None = None
    total_cases_high: float | None = None
    model_name: str = "illustrative_seir"
    disclaimer: str = (
        "Illustrative generic SEIR model with user-supplied parameters — not the "
        "trained, data-fitted forecasting model (Module 2). For exploring "
        "intervention trade-offs only, not for operational decisions."
    )


class UploadSimulationRow(BaseModel):
    date: str
    actual: float | None = None
    fitted: float | None = None
    predicted: float | None = None


class UploadSimulationResponse(BaseModel):
    population: int
    rows_used: int
    used_rainfall: bool
    fitted_params: dict[str, float]
    fit_relative_error: float = Field(..., description="RMSE(fitted, actual) / mean(actual) over the uploaded window")
    series: list[UploadSimulationRow]
    warnings: list[str]
    disclaimer: str
