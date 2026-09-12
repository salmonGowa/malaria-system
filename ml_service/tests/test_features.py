from datetime import date

from app.features import FEATURE_NAMES, MIN_HISTORY_MONTHS, build_features, label_outbreak


def test_returns_none_with_insufficient_history():
    assert build_features([10, 20], [5, 6], date(2026, 3, 1), 100000) is None
    assert MIN_HISTORY_MONTHS == 3


def test_build_features_lag_alignment():
    """lag1 should be the LAST element (most recent), lag3 the third-from-last."""
    rainfall = [10, 20, 30, 40]
    cases = [5, 6, 7, 8]
    feats = build_features(rainfall, cases, date(2026, 5, 1), 100000)

    assert feats["rainfall_lag1"] == 40
    assert feats["rainfall_lag2"] == 30
    assert feats["rainfall_lag3"] == 20
    assert feats["cases_lag1"] == 8
    assert feats["cases_lag2"] == 7
    assert feats["cases_lag3"] == 6
    assert set(feats.keys()) == set(FEATURE_NAMES)


def test_rolling_stats_use_last_three_months():
    feats = build_features([1, 2, 3, 4], [10, 20, 30, 40], date(2026, 5, 1), 1)
    assert feats["cases_rolling_mean_3"] == (20 + 30 + 40) / 3


def test_month_encoding_is_cyclic():
    jan = build_features([1, 2, 3], [1, 2, 3], date(2026, 1, 1), 1)
    dec = build_features([1, 2, 3], [1, 2, 3], date(2026, 12, 1), 1)
    # January and December are adjacent on the calendar; their sin/cos
    # encodings should be close, not maximally different like raw month
    # numbers (1 vs 12) would suggest.
    import math

    dist = math.hypot(jan["month_sin"] - dec["month_sin"], jan["month_cos"] - dec["month_cos"])
    assert dist < 0.6


def test_label_outbreak_threshold():
    assert label_outbreak(15, baseline_mean=10, baseline_std=3) == 1  # 15 > 13
    assert label_outbreak(13, baseline_mean=10, baseline_std=3) == 0  # not strictly greater
    assert label_outbreak(0, baseline_mean=10, baseline_std=3) == 0
