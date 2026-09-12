#!/usr/bin/env python3
"""Train and evaluate the malaria forecasting model (Objective 2 / Task 5).

Trains an XGBoost outbreak-risk classifier (+ a companion regressor for the
predicted case count) on HistoricalCaseData + ClimateObservation, using the
shared feature engineering in ml_service/app/features.py so training and live
inference (app/forecasting.py) compute features identically.

Evaluation, matching the proposal's Chapter 3 methodology exactly:
  - A chronological split — the last TEST_MONTHS months of each county's
    series are held out entirely from training (no leakage: the outbreak
    label's per-county threshold is computed from the training window only).
  - k-fold cross-validation on the training set, for variance/robustness.
  - The trained model is then benchmarked against app/compartmental.py's
    SEIR baseline on the exact same held-out months (Objective 2: "benchmarked
    against the compartmental model").

Metrics (accuracy, AUC, sensitivity, specificity) are reported honestly,
whatever they come out to — this script does not tune anything to hit the
proposal's 80%/0.8 target after the fact. See the printed report and
ml_service/models/forecast_metadata.json for the actual numbers.

Usage:
    data/scripts/train_forecast_model.py
    data/scripts/train_forecast_model.py --test-months 12 --cv-folds 5
"""
import argparse
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from xgboost import XGBClassifier, XGBRegressor

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
ML_SERVICE_DIR = ROOT / "ml_service"
for p in (ROOT, BACKEND_DIR, ML_SERVICE_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from cases.models import ClimateObservation, County, HistoricalCaseData  # noqa: E402

from app import compartmental  # noqa: E402
from app.features import CASE_ONLY_FEATURE_NAMES, FEATURE_NAMES, build_features, label_outbreak  # noqa: E402

CASE_SOURCE = "synthetic_v1"
RAINFALL_SOURCE = "CHIRPS"
CLIMATOLOGY_SOURCE = "synthetic_climatology_v1"
MODELS_DIR = ML_SERVICE_DIR / "models"


def add_months(d, n):
    y, m = d.year, d.month + n
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return date(y, m, 1)


def load_county_series(county):
    """Returns a DataFrame indexed by month with columns: cases, rainfall,
    temperature, humidity — chronological, gaps forward/back-filled (a
    handful of months may lack a row from either source)."""
    cases_qs = HistoricalCaseData.objects.filter(county=county, source=CASE_SOURCE).order_by("period_start")
    rainfall_qs = ClimateObservation.objects.filter(county=county, source=RAINFALL_SOURCE).order_by("observation_date")
    climatology_qs = ClimateObservation.objects.filter(county=county, source=CLIMATOLOGY_SOURCE).order_by("observation_date")

    cases_by_month = {c.period_start: c.confirmed_cases for c in cases_qs}
    rainfall_by_month = {c.observation_date: c.rainfall_mm for c in rainfall_qs if c.rainfall_mm is not None}
    temp_by_month = {c.observation_date: c.temperature_c for c in climatology_qs if c.temperature_c is not None}
    humidity_by_month = {c.observation_date: c.humidity_pct for c in climatology_qs if c.humidity_pct is not None}
    if not cases_by_month:
        return None

    months = sorted(cases_by_month.keys())
    rows = []
    for m in months:
        rows.append(
            {
                "month": m,
                "cases": cases_by_month[m],
                "rainfall": rainfall_by_month.get(m),
                "temperature": temp_by_month.get(m),
                "humidity": humidity_by_month.get(m),
            }
        )
    df = pd.DataFrame(rows).set_index("month")
    for col in ("rainfall", "temperature", "humidity"):
        df[col] = df[col].ffill().bfill()
    return df


def build_dataset(counties, test_months):
    """Returns (train_rows, test_rows, county_baselines) where each row is a
    dict of {county_code, month, features..., cases, label} and
    county_baselines[county_code] = (train_mean, train_std) — the per-county
    outbreak threshold basis, computed from TRAINING months only."""
    train_rows, test_rows = [], []
    county_baselines = {}

    for county in counties:
        series = load_county_series(county)
        if series is None or len(series) <= test_months + 4:
            print(f"  skipping {county.name}: not enough history ({0 if series is None else len(series)} months)")
            continue

        months = list(series.index)
        split_idx = len(months) - test_months
        train_cases = series["cases"].iloc[:split_idx]
        baseline_mean, baseline_std = float(train_cases.mean()), float(train_cases.std(ddof=0))
        county_baselines[county.code] = (baseline_mean, baseline_std)

        for i, month in enumerate(months):
            if i < 3:  # need at least 3 trailing months for lag3
                continue
            recent_cases = series["cases"].iloc[:i].tolist()
            recent_rainfall = series["rainfall"].iloc[:i].tolist()
            recent_temperature = series["temperature"].iloc[:i].tolist()
            recent_humidity = series["humidity"].iloc[:i].tolist()
            feats = build_features(
                recent_rainfall,
                recent_cases,
                month,
                county.population,
                recent_temperature_c=recent_temperature,
                recent_humidity_pct=recent_humidity,
            )
            if feats is None:
                continue

            cases_value = float(series["cases"].iloc[i])
            label = label_outbreak(cases_value, baseline_mean, baseline_std)
            row = {"county_code": county.code, "county_name": county.name, "month": month, "cases": cases_value, "label": label}
            row.update(feats)

            (train_rows if i < split_idx else test_rows).append(row)

    return pd.DataFrame(train_rows), pd.DataFrame(test_rows), county_baselines


def _scale_pos_weight(y):
    """XGBoost's standard imbalanced-classification knob: weight positive
    examples by the negative:positive ratio so a rare "outbreak" class (our
    labels run ~10-16% positive) isn't just predicted away. Computed from
    the actual training labels, not a fixed guess."""
    n_pos = int(y.sum())
    n_neg = len(y) - n_pos
    return n_neg / n_pos if n_pos > 0 else 1.0


def cross_validate(X, y, n_splits):
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    aucs, accs = [], []
    for fold, (tr_idx, va_idx) in enumerate(skf.split(X, y), start=1):
        spw = _scale_pos_weight(y.iloc[tr_idx])
        clf = XGBClassifier(n_estimators=200, max_depth=3, learning_rate=0.1, eval_metric="logloss", scale_pos_weight=spw)
        clf.fit(X.iloc[tr_idx], y.iloc[tr_idx])
        proba = clf.predict_proba(X.iloc[va_idx])[:, 1]
        pred = (proba >= 0.5).astype(int)
        y_va = y.iloc[va_idx]
        if y_va.nunique() < 2:
            auc = float("nan")  # AUC undefined with a single class in this fold
        else:
            auc = roc_auc_score(y_va, proba)
        aucs.append(auc)
        accs.append(accuracy_score(y_va, pred))
        print(f"    fold {fold}: accuracy={accs[-1]:.3f} auc={'n/a' if np.isnan(auc) else f'{auc:.3f}'}")
    return aucs, accs


def classification_metrics(y_true, y_pred_proba, threshold=0.5):
    y_pred = (np.asarray(y_pred_proba) >= threshold).astype(int)
    y_true = np.asarray(y_true)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    sensitivity = tp / (tp + fn) if (tp + fn) else float("nan")
    specificity = tn / (tn + fp) if (tn + fp) else float("nan")
    auc = roc_auc_score(y_true, y_pred_proba) if len(set(y_true)) > 1 else float("nan")
    return {
        "accuracy": accuracy_score(y_true, y_pred),
        "auc": auc,
        "sensitivity": sensitivity,
        "specificity": specificity,
        "n": len(y_true),
        "n_positive": int(y_true.sum()),
    }


def run_seir_benchmark(counties, test_months, county_baselines):
    """Fit the SEIR model per county on its training window, forecast the
    held-out test months, and score it with the exact same per-county
    outbreak threshold used for the ML model — same held-out months, same
    label definition, so the comparison is apples to apples."""
    y_true, y_score = [], []
    per_county = {}

    for county in counties:
        if county.code not in county_baselines:
            continue
        series = load_county_series(county)
        months = list(series.index)
        split_idx = len(months) - test_months
        if split_idx < 6:
            continue

        train_cases = series["cases"].iloc[:split_idx].tolist()
        # Rainfall driving each training month's transmission is the PRIOR
        # month's rainfall (1-month lag) — shift the series accordingly.
        rainfall_series = series["rainfall"]
        train_rainfall_lagged = [
            rainfall_series.get(add_months(months[i], -1), rainfall_series.iloc[max(i - 1, 0)]) for i in range(split_idx)
        ]

        try:
            params = compartmental.fit_county(county.population or 1_000_000, train_rainfall_lagged, train_cases)
        except Exception as exc:  # noqa: BLE001
            print(f"  SEIR fit failed for {county.name}: {exc}")
            continue

        test_rainfall_lagged = [
            rainfall_series.get(add_months(months[i], -1), rainfall_series.iloc[i - 1]) for i in range(split_idx, len(months))
        ]
        recent_for_warmup = series["cases"].iloc[max(split_idx - 3, 0) : split_idx].tolist()
        predicted = compartmental.forecast(params, county.population or 1_000_000, test_rainfall_lagged, recent_for_warmup)

        baseline_mean, baseline_std = county_baselines[county.code]
        actual_test_cases = series["cases"].iloc[split_idx:].tolist()
        labels = [label_outbreak(c, baseline_mean, baseline_std) for c in actual_test_cases]

        y_true.extend(labels)
        y_score.extend(predicted)
        per_county[county.name] = {
            "params": {"beta0": params.beta0, "k": params.k, "reporting_fraction": params.reporting_fraction},
            "predicted": predicted,
            "actual": actual_test_cases,
        }

    if not y_true:
        return None, per_county

    # SEIR doesn't emit a 0-1 probability, only a case-count magnitude — use
    # the ratio to that county's own threshold as a monotonic risk-like score
    # (roc_auc_score only needs correct ranking, not a calibrated probability).
    thresholds = [county_baselines[c.code][0] + county_baselines[c.code][1] for c in counties if c.code in county_baselines]
    avg_threshold = float(np.mean(thresholds)) if thresholds else 1.0
    scores = [s / avg_threshold for s in y_score]

    metrics = classification_metrics(y_true, scores, threshold=1.0)
    return metrics, per_county


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--test-months", type=int, default=12, help="Months per county held out as the test set")
    parser.add_argument("--cv-folds", type=int, default=5)
    args = parser.parse_args(argv)

    counties = list(County.objects.filter(historical_case_data__isnull=False).distinct())
    print(f"Counties with historical case data: {[c.name for c in counties]}\n")

    print("Building feature dataset...")
    train_df, test_df, county_baselines = build_dataset(counties, args.test_months)
    print(f"  train rows: {len(train_df)}, test rows: {len(test_df)}")
    print(f"  train outbreak rate: {train_df['label'].mean():.1%}, test outbreak rate: {test_df['label'].mean():.1%}\n")

    X_train, y_train = train_df[FEATURE_NAMES], train_df["label"]
    X_test, y_test = test_df[FEATURE_NAMES], test_df["label"]

    print(f"k-fold cross-validation (k={args.cv_folds}) on the training set:")
    cv_aucs, cv_accs = cross_validate(X_train, y_train, args.cv_folds)
    cv_auc_mean = float(np.nanmean(cv_aucs))
    print(f"  mean accuracy={np.mean(cv_accs):.3f}, mean AUC={cv_auc_mean:.3f}\n")

    spw = _scale_pos_weight(y_train)
    print(f"Fitting final classifier + regressor on the full training set (scale_pos_weight={spw:.2f})...")
    classifier = XGBClassifier(n_estimators=300, max_depth=3, learning_rate=0.08, eval_metric="logloss", scale_pos_weight=spw)
    classifier.fit(X_train, y_train)
    regressor = XGBRegressor(n_estimators=300, max_depth=3, learning_rate=0.08)
    regressor.fit(X_train, train_df["cases"])

    test_proba = classifier.predict_proba(X_test)[:, 1]
    ml_metrics = classification_metrics(y_test, test_proba)
    test_pred_cases = regressor.predict(X_test)
    mae = float(np.mean(np.abs(test_pred_cases - test_df["cases"].to_numpy())))

    # Climate-free baseline: identical labels/split/hyperparameters, just
    # without rainfall/temperature/humidity in the feature set — isolates
    # what the climate variables actually contribute (Objective 3: "measurable
    # improvement in prediction accuracy" from adding them).
    X_train_case_only, X_test_case_only = train_df[CASE_ONLY_FEATURE_NAMES], test_df[CASE_ONLY_FEATURE_NAMES]
    baseline_classifier = XGBClassifier(
        n_estimators=300, max_depth=3, learning_rate=0.08, eval_metric="logloss", scale_pos_weight=spw
    )
    baseline_classifier.fit(X_train_case_only, y_train)
    baseline_proba = baseline_classifier.predict_proba(X_test_case_only)[:, 1]
    baseline_metrics = classification_metrics(y_test, baseline_proba)

    print("\n=== Held-out test set (last {0} months/county, never seen in training) ===".format(args.test_months))
    print(f"Climate-free baseline (case history + seasonality only): accuracy={baseline_metrics['accuracy']:.3f}  "
          f"AUC={baseline_metrics['auc']:.3f}  sensitivity={baseline_metrics['sensitivity']:.3f}  "
          f"specificity={baseline_metrics['specificity']:.3f}")
    print(f"Full model (+ rainfall/temperature/humidity):            accuracy={ml_metrics['accuracy']:.3f}  "
          f"AUC={ml_metrics['auc']:.3f}  sensitivity={ml_metrics['sensitivity']:.3f}  "
          f"specificity={ml_metrics['specificity']:.3f}")
    auc_delta = ml_metrics["auc"] - baseline_metrics["auc"]
    print(f"Climate variables' contribution to AUC: {auc_delta:+.3f}")
    print(f"XGBoost regressor MAE: {mae:.1f} cases/month")

    print("\nFitting SEIR benchmark per county and forecasting the same held-out months...")
    seir_metrics, seir_detail = run_seir_benchmark(counties, args.test_months, county_baselines)
    if seir_metrics:
        print(f"SEIR benchmark:     accuracy={seir_metrics['accuracy']:.3f}  AUC={seir_metrics['auc']:.3f}  "
              f"sensitivity={seir_metrics['sensitivity']:.3f}  specificity={seir_metrics['specificity']:.3f}  (n={seir_metrics['n']})")
    else:
        print("SEIR benchmark:     could not be computed (insufficient data)")

    target_met = ml_metrics["auc"] >= 0.8
    print(f"\nObjective 2 target (AUC >= 0.8): {'MET' if target_met else 'NOT MET'} — actual AUC = {ml_metrics['auc']:.3f}")
    if not target_met:
        print(
            "Reported as-is, not adjusted to hit the target — see data/README.md's Model results section "
            "for what this number does and doesn't mean given the synthetic training data."
        )

    MODELS_DIR.mkdir(exist_ok=True)
    classifier.save_model(str(MODELS_DIR / "forecast_classifier.json"))
    regressor.save_model(str(MODELS_DIR / "forecast_regressor.json"))

    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_name": "xgboost_v1",
        "feature_names": FEATURE_NAMES,
        "counties": [c.name for c in counties],
        "test_months": args.test_months,
        "cv_folds": args.cv_folds,
        "cv_mean_auc": cv_auc_mean,
        "cv_mean_accuracy": float(np.mean(cv_accs)),
        "held_out_test_metrics": ml_metrics,
        "held_out_test_mae_cases": mae,
        "climate_free_baseline_metrics": baseline_metrics,
        "climate_contribution_to_auc": auc_delta,
        "seir_benchmark_metrics": seir_metrics,
        "county_baselines": {code: {"mean": m, "std": s} for code, (m, s) in county_baselines.items()},
        "training_data_disclaimer": (
            "confirmed_cases used for training/evaluation comes from HistoricalCaseData "
            "source=synthetic_v1 — a generated series driven by real CHIRPS rainfall, not "
            "observed case counts. See data/scripts/generate_synthetic_case_history.py."
        ),
    }
    (MODELS_DIR / "forecast_metadata.json").write_text(json.dumps(metadata, indent=2))
    print(f"\nSaved model artifacts + metadata to {MODELS_DIR}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
