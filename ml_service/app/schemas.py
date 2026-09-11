from datetime import date

from pydantic import BaseModel, Field


class ForecastRequest(BaseModel):
    county_code: str = Field(..., description="County code, e.g. KEN-042")
    as_of_date: date = Field(..., description="Forecast is generated using data up to this date")
    horizon_weeks: int = Field(4, ge=1, le=26)


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


class AllocationLine(BaseModel):
    county_code: str
    recommended_doses: int
    rationale: str


class AllocationResponse(BaseModel):
    total_available_doses: int
    total_allocated_doses: int
    allocations: list[AllocationLine]
