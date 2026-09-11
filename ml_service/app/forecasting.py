"""Forecasting module — PLACEHOLDER.

This is intentionally a stub, not the real model. Module 2 of the project (see
docs/roadmap.md) replaces `naive_forecast` with a trained XGBoost/scikit-learn
model loaded from an artifact (e.g. `models/forecast_xgb.json`), following the
CRISP-DM workflow described in the proposal's Chapter 3. Keeping the function
signature stable now means the FastAPI route and the Django/frontend callers
don't need to change when the real model lands — only this function's body does.
"""

from datetime import date, timedelta

from app.schemas import ForecastRequest, ForecastResponse


def naive_forecast(request: ForecastRequest) -> ForecastResponse:
    """Deterministic placeholder so the endpoint is exercisable end-to-end before
    a trained model exists. Do not use this for anything resembling a real
    recommendation — it has no relationship to actual case or climate data."""

    period_start = request.as_of_date
    period_end = period_start + timedelta(weeks=request.horizon_weeks)

    return ForecastResponse(
        county_code=request.county_code,
        forecast_period_start=period_start,
        forecast_period_end=period_end,
        predicted_cases=0.0,
        risk_score=0.0,
        model_name="placeholder_not_trained",
        model_version="0.0.0",
    )
