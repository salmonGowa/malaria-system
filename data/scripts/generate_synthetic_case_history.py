"""Generate synthetic monthly HistoricalCaseData for model training/evaluation.

Real 5-year county-monthly malaria case data isn't obtainable within this
project's scope (see docs/data-sources.md — DHIS2 needs an approval this
project doesn't have, MAP publishes modelled incidence surfaces rather than a
monthly case count table). This generates a synthetic series instead, always
written with source="synthetic_v1" so it's never mistaken for an observation
(see HistoricalCaseData's docstring in cases/models.py for why this is a
separate table from the real, hash-chained CaseReport).

This is NOT a random series: expected cases each month are driven by (a) a
county-specific baseline incidence rate, (b) REAL CHIRPS rainfall for that
county 1-2 months prior (the generative link between climate and case
counts that the whole forecasting objective is trying to recover), and (c)
overdispersed count noise (negative binomial, not Poisson — real case counts
are more variable than Poisson implies). The point of driving it from real
rainfall rather than pure noise is that a model trained on this data has to
actually learn a genuine climate -> incidence relationship to score well; it
isn't a trivially-easy synthetic target.

Baseline incidence rates below are order-of-magnitude approximations
consistent with the lake-region-vs-coastal burden difference described in
docs/architecture.md and the proposal's own literature review (Severe
Malaria Observatory, 2026) — not a claimed measurement. Swap this script out
entirely once real facility/DHIS2 data at this depth becomes available;
nothing downstream (feature engineering, model training) needs to change,
since both read HistoricalCaseData by (county, period_start, confirmed_cases)
regardless of source.
"""
import argparse
import hashlib
import os
import sys
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from cases.models import ClimateObservation, County, HistoricalCaseData  # noqa: E402

SOURCE = "synthetic_v1"
NEGBINOM_DISPERSION = 8.0  # smaller = more overdispersed/noisy; 8 is moderate

# Approximate annual confirmed cases per 1,000 population, by county — the
# lake-region / coastal split described in docs/architecture.md and the
# proposal's Chapter 2. Illustrative, not a cited figure for any single county.
ANNUAL_CASES_PER_1000 = {
    "Kisumu": 200.0,
    "Siaya": 260.0,
    "Homa Bay": 240.0,
    "Busia": 220.0,
    "Migori": 230.0,  # lake-endemic, comparable to Homa Bay/Busia
    "Kakamega": 210.0,  # lake-endemic zone extends into western highlands fringe
    "Vihiga": 190.0,
    "Bungoma": 180.0,  # fringe of the lake-endemic zone, moving toward highland
    "Kisii": 60.0,  # highland-epidemic zone: higher altitude, lower/episodic transmission
    "Nyamira": 55.0,  # highland-epidemic, similar profile to Kisii
    "Kilifi": 90.0,  # coastal Kenya has seen steeper transmission decline than the lake region
    "Kwale": 130.0,  # coast-endemic
    "Mombasa": 40.0,  # predominantly urban — much lower breeding habitat/transmission
    "Taita Taveta": 70.0,  # semi-arid coast hinterland, more seasonal
}


def month_range(start, end):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield date(y, m, 1)
        m += 1
        if m > 12:
            m = 1
            y += 1


def add_months(d, n):
    y, m = d.year, d.month + n
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return date(y, m, 1)


def rainfall_response(rainfall_mm):
    """Diminishing-returns response to rainfall: more rain -> more breeding
    habitat -> more transmission, but not unboundedly (a log curve rather
    than linear, so an extreme rainfall month doesn't blow up the forecast)."""
    return np.log1p(max(rainfall_mm, 0.0) / 40.0)  # ~40mm/month is a rough "typical" scale


def county_seed(county_code):
    return int(hashlib.sha256(county_code.encode()).hexdigest()[:8], 16)


def generate_series(county, rainfall_by_month, months):
    """Returns {month: confirmed_cases} for one county."""
    annual_rate = ANNUAL_CASES_PER_1000.get(county.name)
    if annual_rate is None:
        raise ValueError(f"No ANNUAL_CASES_PER_1000 entry for {county.name!r} — add one before generating for it.")
    population = county.population or 1_000_000
    monthly_baseline = (annual_rate / 1000.0) * population / 12.0

    rng = np.random.default_rng(seed=county_seed(county.code))

    # A gentle multi-year drift, consistent with the proposal's own framing
    # (Chapter 1: "Kenya's malaria case numbers have continued to rise") —
    # kept modest so it doesn't dominate the seasonal/rainfall signal.
    drift_per_month = rng.uniform(0.0005, 0.0025)

    series = {}
    for i, month in enumerate(months):
        # 1-2 month lag: mosquito breeding responds to rain with a delay
        # before it shows up as human cases.
        lag1 = rainfall_by_month.get(add_months(month, -1))
        lag2 = rainfall_by_month.get(add_months(month, -2))
        response = 0.6 * rainfall_response(lag1 if lag1 is not None else 0.0) + 0.4 * rainfall_response(
            lag2 if lag2 is not None else 0.0
        )

        seasonal_multiplier = 0.55 + response  # floor so a zero-rain month isn't zero cases
        trend_multiplier = 1.0 + drift_per_month * i

        expected = monthly_baseline * seasonal_multiplier * trend_multiplier
        expected = max(expected, 1.0)

        # Negative binomial via numpy's (n, p) parameterization from a
        # target mean/dispersion: p = r / (r + mean), n = r.
        r = NEGBINOM_DISPERSION
        p = r / (r + expected)
        cases = rng.negative_binomial(r, p)
        series[month] = float(cases)

    return series


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", required=True, help="First month, YYYY-MM")
    parser.add_argument("--end", required=True, help="Last month (inclusive), YYYY-MM")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    start = date(int(args.start[:4]), int(args.start[5:7]), 1)
    end = date(int(args.end[:4]), int(args.end[5:7]), 1)
    months = list(month_range(start, end))

    counties = list(County.objects.filter(name__in=ANNUAL_CASES_PER_1000.keys()))
    missing = set(ANNUAL_CASES_PER_1000) - {c.name for c in counties}
    if missing:
        print(f"No County row for: {missing} — skipping")

    written = 0
    for county in counties:
        # Pull real rainfall (CHIRPS) 2 months before the window starts too,
        # so the first couple of months still get a real lag signal.
        rainfall_qs = ClimateObservation.objects.filter(
            county=county,
            source="CHIRPS",
            observation_date__gte=add_months(start, -2),
            observation_date__lte=end,
        )
        rainfall_by_month = {obs.observation_date: obs.rainfall_mm for obs in rainfall_qs if obs.rainfall_mm is not None}
        have = sum(1 for m in months if m in rainfall_by_month)
        print(f"{county.name}: real CHIRPS rainfall available for {have}/{len(months)} months in range")

        series = generate_series(county, rainfall_by_month, months)

        for month, cases in series.items():
            if args.dry_run:
                continue
            obj, _ = HistoricalCaseData.objects.update_or_create(
                county=county, period_start=month, source=SOURCE, defaults={"confirmed_cases": cases}
            )
            written += 1

        if args.dry_run:
            preview = ", ".join(f"{m:%Y-%m}={series[m]:.0f}" for m in months[:6])
            print(f"  preview: {preview}, ...")

    if not args.dry_run:
        print(f"\nWrote {written} HistoricalCaseData rows (source={SOURCE})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
