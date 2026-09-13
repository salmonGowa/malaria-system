from datetime import date

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


class SimulationWeek(BaseModel):
    week: int
    susceptible: float
    exposed: float
    infectious: float
    recovered: float
    new_cases: float


class SimulationResponse(BaseModel):
    weeks: list[SimulationWeek]
    peak_week: int
    peak_infectious: float
    total_projected_cases: float
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
