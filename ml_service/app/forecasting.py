"""Forecasting module — real implementation (Module 2 / Task 5).

Loads the XGBoost classifier + regressor trained by
data/scripts/train_forecast_model.py from ml_service/models/. Both the
training script and this module build features via app/features.py, which is
what keeps training and serving honest — the model sees the same shape of
input at request time that it learned from, computed the same way.

ml_service has no database of its own (see docs/architecture.md), so the
caller (Django's ForecastGenerationService) is responsible for gathering each
county's recent rainfall/case history and passing it in the request.

Raises rather than guessing when:
  - the model hasn't been trained yet (no artifacts under ml_service/models/), or
  - the request doesn't carry enough trailing history (< 3 months) to compute
    lag features — see app/features.py's MIN_HISTORY_MONTHS.
main.py maps both to a clear HTTP error rather than a 500.
"""
from datetime import timedelta
from pathlib import Path

import pandas as pd

from app.features import FEATURE_NAMES, build_features
from app.schemas import ForecastRequest, ForecastResponse

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


class ModelNotTrainedError(RuntimeError):
    """No trained model artifacts on disk yet — run data/scripts/train_forecast_model.py."""


class InsufficientHistoryError(ValueError):
    """The request didn't include enough trailing history to forecast."""


_classifier = None
_regressor = None
_metadata = None


def _load_models():
    global _classifier, _regressor, _metadata
    if _classifier is not None:
        return

    classifier_path = MODELS_DIR / "forecast_classifier.json"
    regressor_path = MODELS_DIR / "forecast_regressor.json"
    metadata_path = MODELS_DIR / "forecast_metadata.json"
    if not (classifier_path.exists() and regressor_path.exists() and metadata_path.exists()):
        raise ModelNotTrainedError(
            "No trained forecast model found under ml_service/models/ — run "
            "data/scripts/train_forecast_model.py first."
        )

    import json

    from xgboost import XGBClassifier, XGBRegressor

    clf = XGBClassifier()
    clf.load_model(str(classifier_path))
    reg = XGBRegressor()
    reg.load_model(str(regressor_path))
    meta = json.loads(metadata_path.read_text())

    _classifier, _regressor, _metadata = clf, reg, meta


def trained_forecast(request: ForecastRequest) -> ForecastResponse:
    _load_models()

    feats = build_features(
        request.recent_rainfall_mm,
        request.recent_confirmed_cases,
        request.as_of_date,
        request.population,
        recent_temperature_c=request.recent_temperature_c,
        recent_humidity_pct=request.recent_humidity_pct,
    )
    if feats is None:
        raise InsufficientHistoryError(
            f"Need at least 3 months of recent_confirmed_cases and recent_rainfall_mm to forecast "
            f"{request.county_code} — got {len(request.recent_confirmed_cases)} and "
            f"{len(request.recent_rainfall_mm)} respectively."
        )

    X = pd.DataFrame([feats])[FEATURE_NAMES]
    risk_score = float(_classifier.predict_proba(X)[0, 1])
    predicted_cases = float(max(_regressor.predict(X)[0], 0.0))

    period_start = request.as_of_date
    period_end = period_start + timedelta(weeks=request.horizon_weeks)

    return ForecastResponse(
        county_code=request.county_code,
        forecast_period_start=period_start,
        forecast_period_end=period_end,
        predicted_cases=predicted_cases,
        risk_score=risk_score,
        model_name=_metadata["model_name"],
        model_version=_metadata["trained_at"],
    )
