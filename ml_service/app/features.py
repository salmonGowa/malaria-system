"""Feature engineering shared by offline training (data/scripts/train_forecast_model.py)
and live inference (app/forecasting.py).

Keeping this in one place — rather than reimplementing the same lag/rolling
logic in both the training script and the request-time predictor — is what
prevents train/serve skew: whatever the model learned from during training is
exactly what it's given at inference time, computed the same way.

ml_service has no database of its own (see docs/architecture.md); the
backend is responsible for gathering each county's recent rainfall/case
history and passing it in the request. `build_features` and `label_outbreak`
below are pure functions over plain lists so they work identically whether
called from a live request or a bulk training script iterating over
HistoricalCaseData/ClimateObservation rows.
"""
from __future__ import annotations

import math

# Case-history + seasonality features only — no climate. Kept as its own
# name list so train_forecast_model.py can train a "climate-free" baseline
# and measure climate's actual marginal contribution (Objective 3: "measurable
# improvement in prediction accuracy" from adding rainfall/temperature/humidity),
# rather than just asserting the full model is better.
CASE_ONLY_FEATURE_NAMES = [
    "cases_lag1",
    "cases_lag2",
    "cases_lag3",
    "cases_rolling_mean_3",
    "cases_rolling_std_3",
    "month_sin",
    "month_cos",
    "population_log",
]

# Climate lags are lag1-only (not lag1-3 like rainfall/cases) to limit how many
# features a ~225-row training set has to support — see data/README.md's
# Model results section for why that matters here.
CLIMATE_FEATURE_NAMES = [
    "rainfall_lag1",
    "rainfall_lag2",
    "rainfall_lag3",
    "temperature_lag1",
    "humidity_lag1",
]

FEATURE_NAMES = CASE_ONLY_FEATURE_NAMES + CLIMATE_FEATURE_NAMES

MIN_HISTORY_MONTHS = 3  # rainfall/cases lag3 needs at least 3 trailing months of history


def _lag(series, k):
    """series is ordered oldest -> newest, ending the month *before* the
    target month. lag1 = value 1 month before target, i.e. series[-1]."""
    idx = len(series) - k
    if 0 <= idx < len(series):
        return float(series[idx])
    return None


def build_features(
    recent_rainfall_mm,
    recent_confirmed_cases,
    target_month,
    population,
    recent_temperature_c=None,
    recent_humidity_pct=None,
):
    """`recent_rainfall_mm` / `recent_confirmed_cases`: lists ordered oldest
    -> newest, both ending at the month immediately before `target_month`
    (the month being forecast). `recent_temperature_c` / `recent_humidity_pct`
    are optional (same ordering/window) — a missing value becomes 0.0 for
    that lag rather than dropping the row, since ERA5 coverage may be
    incomplete (see docs/data-sources.md); rainfall/cases still require full
    history. `target_month`: a `date` (or anything with `.month`) for the
    month being forecast. `population`: county population, used log-scaled so
    the model can learn a per-capita-ish baseline rate without the raw
    population dominating the loss.

    Returns None if there isn't enough trailing rainfall/case history
    (< MIN_HISTORY_MONTHS) to compute lag3 — callers should skip/reject
    rather than feed in zero-filled lags, which would look like "no rain, no
    cases" rather than "unknown".
    """
    cases = list(recent_confirmed_cases or [])
    rainfall = list(recent_rainfall_mm or [])
    if len(cases) < MIN_HISTORY_MONTHS or len(rainfall) < MIN_HISTORY_MONTHS:
        return None

    temperature = list(recent_temperature_c or [])
    humidity = list(recent_humidity_pct or [])

    window = cases[-3:]
    rolling_mean = sum(window) / len(window)
    variance = sum((x - rolling_mean) ** 2 for x in window) / len(window)
    rolling_std = math.sqrt(variance)

    month_angle = 2 * math.pi * ((target_month.month - 1) % 12) / 12

    return {
        "rainfall_lag1": _lag(rainfall, 1),
        "rainfall_lag2": _lag(rainfall, 2),
        "rainfall_lag3": _lag(rainfall, 3),
        "temperature_lag1": _lag(temperature, 1) or 0.0,
        "humidity_lag1": _lag(humidity, 1) or 0.0,
        "cases_lag1": _lag(cases, 1),
        "cases_lag2": _lag(cases, 2),
        "cases_lag3": _lag(cases, 3),
        "cases_rolling_mean_3": rolling_mean,
        "cases_rolling_std_3": rolling_std,
        "month_sin": math.sin(month_angle),
        "month_cos": math.cos(month_angle),
        "population_log": math.log1p(population or 0),
    }


def feature_vector(feature_dict):
    """Dict -> ordered list matching FEATURE_NAMES, for feeding a model that
    wants a plain array rather than named columns."""
    return [feature_dict[name] for name in FEATURE_NAMES]


def label_outbreak(cases_value, baseline_mean, baseline_std):
    """Binary "is this an outbreak month" label: cases more than one standard
    deviation above that county's own historical mean. A standard
    anomaly-detection threshold for count-based surveillance data — computed
    per county so a naturally higher-burden county isn't automatically
    flagged as "always outbreak" relative to a lower-burden one.

    `baseline_mean`/`baseline_std` must come from the *training* portion of
    a county's history only — computing them over the full series (test
    months included) would leak test-set information into the label.
    """
    threshold = baseline_mean + baseline_std
    return 1 if cases_value > threshold else 0
