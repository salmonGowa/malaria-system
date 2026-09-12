"""Tests for app/forecasting.py's real (trained-model) implementation.

test_trained_forecast_predicts_when_model_exists is skipped automatically if
data/scripts/train_forecast_model.py hasn't been run yet — CI/a fresh clone
won't have ml_service/models/ populated, and that's a legitimate state (see
ModelNotTrainedError), not a test failure.
"""
from datetime import date

import pytest

from app import forecasting
from app.forecasting import InsufficientHistoryError, ModelNotTrainedError, trained_forecast
from app.schemas import ForecastRequest


def test_raises_insufficient_history_with_short_series(monkeypatch):
    # Force _load_models to succeed as a no-op so we isolate the history check
    # from whether a model happens to be trained in this environment.
    monkeypatch.setattr(forecasting, "_load_models", lambda: None)
    monkeypatch.setattr(forecasting, "_classifier", object(), raising=False)
    monkeypatch.setattr(forecasting, "_regressor", object(), raising=False)
    monkeypatch.setattr(forecasting, "_metadata", {"model_name": "x", "trained_at": "x"}, raising=False)

    request = ForecastRequest(
        county_code="KEN-042",
        as_of_date=date(2026, 5, 1),
        recent_confirmed_cases=[10, 20],  # only 2 months, need >= 3
        recent_rainfall_mm=[5, 10],
    )
    with pytest.raises(InsufficientHistoryError):
        trained_forecast(request)


def test_raises_model_not_trained_when_no_artifacts(monkeypatch, tmp_path):
    monkeypatch.setattr(forecasting, "MODELS_DIR", tmp_path)  # empty dir, no artifacts
    monkeypatch.setattr(forecasting, "_classifier", None, raising=False)
    monkeypatch.setattr(forecasting, "_regressor", None, raising=False)

    request = ForecastRequest(
        county_code="KEN-042",
        as_of_date=date(2026, 5, 1),
        recent_confirmed_cases=[10, 20, 30, 40],
        recent_rainfall_mm=[5, 10, 15, 20],
    )
    with pytest.raises(ModelNotTrainedError):
        trained_forecast(request)


def test_trained_forecast_predicts_when_model_exists():
    if not (forecasting.MODELS_DIR / "forecast_classifier.json").exists():
        pytest.skip("Model not trained yet — run data/scripts/train_forecast_model.py")

    request = ForecastRequest(
        county_code="KEN-042",
        as_of_date=date(2026, 8, 1),
        horizon_weeks=4,
        population=610000,
        recent_confirmed_cases=[15000, 18000, 22000, 25000],
        recent_rainfall_mm=[40, 80, 120, 90],
    )
    response = trained_forecast(request)
    assert 0.0 <= response.risk_score <= 1.0
    assert response.predicted_cases >= 0.0
    assert response.county_code == "KEN-042"
