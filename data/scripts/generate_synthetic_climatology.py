#!/usr/bin/env python3
"""Generate synthetic monthly temperature/humidity ClimateObservation rows.

Real CHIRPS rainfall (data/scripts/aggregate_climate.py) is used wherever
possible in this project — see data/README.md. Temperature and humidity are
the ERA5 half of the proposal's three climate variables, and ERA5 requires a
free Copernicus CDS account and API key this project doesn't have configured;
see docs/data-sources.md. Rather than leave those two variables entirely
absent from the feature set, this generates a deterministic seasonal
climatology per county — NOT reanalysis data, NOT a substitute for real ERA5
— clearly tagged `source="synthetic_climatology_v1"` so it's never mistaken
for an observation.

Calibration: each county's mean/amplitude is a rough, documented
approximation from publicly cited regional climate normals (lake-region vs.
coastal Kenya), not a per-cell measurement. The monthly *shape* (which months
run warmer/more humid) follows Kenya's known bimodal rainfall pattern — long
rains Mar-May, short rains Oct-Dec — since humidity tracks rain and
temperature runs slightly cooler under cloud cover in those months. Swap this
out for real ERA5 the moment CDS credentials are available; nothing downstream
needs to change except which script populates these rows.
"""
import argparse
import math
import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from cases.models import ClimateObservation, County  # noqa: E402

SOURCE = "synthetic_climatology_v1"

# Rough regional normals (degrees C / relative humidity %). Lake-region
# counties: warm, humid, low seasonal amplitude (near-equatorial, lake-
# moderated). Coastal: warmer and more humid year-round with a slightly
# larger swing between the hot Jan-Mar season and the cooler Jun-Aug monsoon.
COUNTY_CLIMATOLOGY = {
    "Kisumu": {"temp_mean": 23.0, "temp_amp": 1.5, "humidity_mean": 68, "humidity_amp": 8},
    "Siaya": {"temp_mean": 23.5, "temp_amp": 1.5, "humidity_mean": 66, "humidity_amp": 8},
    "Homa Bay": {"temp_mean": 22.5, "temp_amp": 1.5, "humidity_mean": 67, "humidity_amp": 8},
    "Busia": {"temp_mean": 23.0, "temp_amp": 1.3, "humidity_mean": 70, "humidity_amp": 7},
    "Kilifi": {"temp_mean": 26.5, "temp_amp": 2.2, "humidity_mean": 78, "humidity_amp": 6},
}

# Relative seasonal shape, one value per calendar month (Jan..Dec), shared
# across counties (only mean/amplitude differ) — negative during the long
# (Mar-May) and short (Oct-Dec) rains, since cloud cover suppresses daytime
# temperature even as humidity rises; positive during the Jan-Feb and
# Jun-Sep dry spells.
TEMP_SEASONAL_SHAPE = [0.6, 0.8, 0.3, -0.6, -0.8, -0.5, -0.7, -0.5, -0.1, 0.1, -0.3, 0.4]
HUMIDITY_SEASONAL_SHAPE = [-0.6, -0.7, 0.2, 0.9, 1.0, 0.3, 0.1, 0.0, -0.2, 0.4, 0.7, -0.1]


def monthly_value(mean, amplitude, shape, month_index, seed_offset):
    """Deterministic seasonal value plus small pseudo-random inter-annual
    wobble (seeded on the month index, not real randomness — reproducible)."""
    seasonal = shape[month_index % 12] * amplitude
    # A small, deterministic pseudo-noise term (not np.random — keeps this
    # script dependency-free and exactly reproducible run to run).
    wobble = 0.35 * amplitude * math.sin(0.9 * (month_index + seed_offset))
    return mean + seasonal + wobble


def month_range(start, end):
    """Yield the first-of-month date for each month from start to end inclusive."""
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield date(y, m, 1)
        m += 1
        if m > 12:
            m = 1
            y += 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", required=True, help="First month, YYYY-MM")
    parser.add_argument("--end", required=True, help="Last month (inclusive), YYYY-MM")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    start = date(int(args.start[:4]), int(args.start[5:7]), 1)
    end = date(int(args.end[:4]), int(args.end[5:7]), 1)

    counties = list(County.objects.filter(name__in=COUNTY_CLIMATOLOGY.keys()))
    missing = set(COUNTY_CLIMATOLOGY) - {c.name for c in counties}
    if missing:
        print(f"No climatology configured for: {missing} (not in COUNTY_CLIMATOLOGY, skipping)")

    written = 0
    for county in counties:
        cal = COUNTY_CLIMATOLOGY[county.name]
        for i, month in enumerate(month_range(start, end)):
            temp = monthly_value(cal["temp_mean"], cal["temp_amp"], TEMP_SEASONAL_SHAPE, month.month - 1, i)
            humidity = monthly_value(cal["humidity_mean"], cal["humidity_amp"], HUMIDITY_SEASONAL_SHAPE, month.month - 1, i)
            humidity = min(max(humidity, 0.0), 100.0)

            if args.dry_run:
                print(f"{county.name} {month:%Y-%m}: temp={temp:.1f}C humidity={humidity:.0f}%")
                continue

            obs, _ = ClimateObservation.objects.get_or_create(county=county, observation_date=month, source=SOURCE)
            obs.temperature_c = temp
            obs.humidity_pct = humidity
            obs.save(update_fields=["temperature_c", "humidity_pct"])
            written += 1

    if not args.dry_run:
        print(f"Wrote {written} ClimateObservation rows (source={SOURCE})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
