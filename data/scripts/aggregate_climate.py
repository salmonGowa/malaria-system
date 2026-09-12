#!/usr/bin/env python3
"""Spatially aggregate a CHIRPS/ERA5 raster to county-level ClimateObservation rows.

Three ways to run it, in the order you'd actually use them:

1. One county, one raster — the pilot run, to eyeball a value before trusting
   the pipeline:
       aggregate_climate.py --county-name Kisumu --raster chirps-2026-07.tif \
           --variable rainfall_mm --source CHIRPS --date 2026-07 --dry-run

2. One raster, every county — once the pilot value looks sane:
       aggregate_climate.py --all-counties --raster chirps-2026-07.tif \
           --variable rainfall_mm --source CHIRPS --date 2026-07

3. Many rasters x many counties in one pass — the actual batch job, driven by
   a CSV manifest (see --manifest below):
       aggregate_climate.py --manifest manifest.csv

Each mode goes through the same aggregate_raster_to_polygon() core, so the
pilot run in mode 1 is validating the exact code path mode 2/3 will run at
scale, not a separate simplified version of it.
"""
import argparse
import csv
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.mask import mask
from shapely.geometry import shape

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

SUPPORTED_VARIABLES = {"rainfall_mm", "temperature_c", "humidity_pct"}
CLIMATE_FIELDS = ("rainfall_mm", "temperature_c", "humidity_pct")

# CHIRPS (and most gridded climate products) use -9999 as a nodata sentinel by
# convention, but don't reliably declare it in the GeoTIFF's own metadata —
# the Africa-monthly product used for the pilot run here is one such case
# (src.nodata reads None despite -9999 sentinel values being present in the
# data). Falling back to isnan() alone would silently average that sentinel
# in as a real rainfall value for any county whose polygon touches a nodata
# cell (coastal slivers, offshore islands, missing tiles). Only used when the
# raster itself doesn't declare a nodata value; override with --nodata if a
# particular source uses something else (e.g. ERA5 netCDF exports sometimes
# use ~9.97e36).
FALLBACK_NODATA = -9999.0


def _geometry_from_county_boundary(boundary):
    if boundary is None:
        raise ValueError("This county has no boundary geometry; add it in the admin before aggregating climate data.")
    try:
        geojson = json.loads(boundary.geojson)
    except AttributeError:
        geojson = json.loads(boundary)
    return shape(geojson)


def aggregate_raster_to_polygon(raster_path, polygon, nodata=None):
    """Return the mean raster value over a polygon, excluding nodata cells.

    `nodata`, if given, overrides both the raster's own declared nodata value
    and FALLBACK_NODATA. Pixels outside the polygon (rasterio's own vector
    mask), pixels equal to the effective nodata value, and any NaN pixels are
    all excluded before averaging.
    """
    raster_path = Path(raster_path)
    if not raster_path.exists():
        raise FileNotFoundError(f"Raster file not found: {raster_path}")

    with rasterio.open(raster_path) as src:
        if src.crs is None:
            raise ValueError(f"Raster {raster_path} has no CRS; add a georeferenced raster before aggregation.")

        effective_nodata = nodata
        if effective_nodata is None:
            effective_nodata = src.nodata if src.nodata is not None else FALLBACK_NODATA

        gdf = gpd.GeoDataFrame(geometry=[polygon], crs="EPSG:4326")
        if gdf.crs != src.crs:
            gdf = gdf.to_crs(src.crs)

        # crop=True + filled=False gives a masked array cropped to the
        # polygon's bbox, with cells outside the polygon shape itself
        # (but inside that bbox) already flagged invalid via .mask.
        out_image, _ = mask(src, gdf.geometry.tolist(), crop=True, all_touched=False, filled=False)
        band = np.ma.getdata(out_image[0]).astype("float64")
        outside_polygon = np.ma.getmaskarray(out_image[0])

        invalid = outside_polygon | np.isnan(band)
        if effective_nodata is not None:
            invalid |= np.isclose(band, effective_nodata)

        valid = band[~invalid]
        if valid.size == 0:
            raise ValueError(
                f"No valid (non-nodata) raster values overlap the county polygon for {raster_path} "
                f"(nodata={effective_nodata})."
            )
        return float(valid.mean())


def _write_observation(county, variable, value, observation_date, source):
    """Set one climate field on the (county, date, source) row without
    touching whatever the other two fields already hold — update_or_create
    with a defaults dict covering all three fields would silently reset the
    sibling fields to None every time, which matters as soon as two
    variables from the same source (e.g. ERA5 temperature_c + humidity_pct)
    land on the same row from separate calls."""
    obj, created = ClimateObservation.objects.get_or_create(
        county=county,
        observation_date=observation_date,
        source=source,
    )
    setattr(obj, variable, value)
    obj.save(update_fields=[variable])
    return obj, created


def aggregate_county_raster_for_date(county, raster_path, variable, observation_date, source, nodata=None, dry_run=False):
    if variable not in SUPPORTED_VARIABLES:
        raise ValueError(f"Unsupported variable '{variable}'. Expected one of: {sorted(SUPPORTED_VARIABLES)}")

    polygon = _geometry_from_county_boundary(county.boundary)
    value = aggregate_raster_to_polygon(raster_path, polygon, nodata=nodata)

    if dry_run:
        return value, None

    obj, created = _write_observation(county, variable, value, observation_date, source)
    return value, created


def parse_date(value):
    value = str(value).strip()
    if not value:
        raise ValueError("A valid observation date is required.")
    for fmt in ("%Y-%m-%d", "%Y-%m"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date '{value}'. Use YYYY-MM-DD or YYYY-MM.")


def _target_counties(county_id, county_name, all_counties):
    if all_counties:
        counties = list(County.objects.exclude(boundary__isnull=True))
        skipped = County.objects.filter(boundary__isnull=True).count()
        if skipped:
            print(f"  (skipping {skipped} county/ies with no boundary geometry)")
        return counties
    if county_id is not None:
        return [County.objects.get(pk=county_id)]
    return [County.objects.get(name=county_name)]


def _run_one(county, raster, variable, observation_date, source, nodata, dry_run):
    """Aggregate + (optionally) write one (county, raster, variable, date,
    source) combination. Returns (ok, message) — never raises, so callers
    running a batch can keep going past one bad county/raster."""
    try:
        value, created = aggregate_county_raster_for_date(
            county, raster, variable, observation_date, source, nodata=nodata, dry_run=dry_run
        )
    except Exception as exc:  # noqa: BLE001 — batch jobs must not die on one bad input
        return False, f"{county.name}: FAILED — {exc}"

    if dry_run:
        return True, f"{county.name}: {variable}={value:.4f} on {observation_date} ({source}) [dry run]"
    verb = "created" if created else "updated"
    return True, f"{county.name}: {verb} {variable}={value:.4f} on {observation_date} ({source})"


def run_manifest(manifest_path, dry_run):
    """Each manifest row is one (raster, variable, source, date) job, applied
    to a named county if given, otherwise to every county with a boundary —
    the mechanism that actually generalizes this to "many months x many
    counties" in one command."""
    manifest_path = Path(manifest_path)
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    ok_count, fail_count = 0, 0
    with manifest_path.open(newline="") as f:
        reader = csv.DictReader(f)
        required = {"raster", "variable", "source", "date"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Manifest is missing required column(s): {sorted(missing)}")

        for i, row in enumerate(reader, start=2):  # start=2: header is line 1
            raster = Path(row["raster"].strip())
            if not raster.is_absolute():
                # Relative to the manifest's own location, not the caller's cwd —
                # a checked-in manifest should work the same regardless of where
                # it's invoked from.
                raster = manifest_path.parent / raster
            variable = row["variable"].strip()
            source = row["source"].strip()
            try:
                observation_date = parse_date(row["date"])
            except ValueError as exc:
                print(f"  line {i}: FAILED — {exc}")
                fail_count += 1
                continue

            county_id = (row.get("county_id") or "").strip()
            county_name = (row.get("county_name") or "").strip()
            nodata_raw = (row.get("nodata") or "").strip()
            nodata = float(nodata_raw) if nodata_raw else None

            try:
                counties = _target_counties(
                    county_id=int(county_id) if county_id else None,
                    county_name=county_name or None,
                    all_counties=not (county_id or county_name),
                )
            except County.DoesNotExist:
                print(f"  line {i}: FAILED — county not found (id={county_id!r} name={county_name!r})")
                fail_count += 1
                continue

            print(f"[{raster} / {variable} / {source} / {observation_date}]")
            for county in counties:
                ok, message = _run_one(county, raster, variable, observation_date, source, nodata, dry_run)
                print(f"  {message}")
                ok_count += 1 if ok else 0
                fail_count += 0 if ok else 1

    print(f"\n{ok_count} succeeded, {fail_count} failed" + (" (dry run, nothing written)" if dry_run else ""))
    return 1 if fail_count else 0


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Aggregate a raster file to county-level monthly climate observation(s).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--county-id", type=int, help="County primary key to aggregate")
    target.add_argument("--county-name", help="County name to aggregate")
    target.add_argument("--all-counties", action="store_true", help="Aggregate for every county that has a boundary")

    parser.add_argument("--manifest", help="CSV of raster,variable,source,date[,county_id|county_name][,nodata] rows — runs in batch mode, ignoring the single-run options below")
    parser.add_argument("--raster", help="Path to the raster file to aggregate")
    parser.add_argument("--variable", choices=sorted(SUPPORTED_VARIABLES), help="Climate field to write to")
    parser.add_argument("--source", help="Source label, e.g. CHIRPS or ERA5")
    parser.add_argument("--date", help="Observation date in YYYY-MM-DD or YYYY-MM format")
    parser.add_argument("--nodata", type=float, default=None, help="Override the raster's nodata value (default: the raster's own, falling back to -9999)")
    parser.add_argument("--dry-run", action="store_true", help="Compute value(s) without writing to the database")

    args = parser.parse_args(argv)

    if args.manifest:
        return run_manifest(args.manifest, args.dry_run)

    if not args.raster or not args.variable or not args.source or not args.date:
        parser.error("--raster, --variable, --source, and --date are required unless --manifest is given.")
    if not args.county_id and not args.county_name and not args.all_counties:
        parser.error("One of --county-id, --county-name, or --all-counties is required.")

    observation_date = parse_date(args.date)
    counties = _target_counties(args.county_id, args.county_name, args.all_counties)

    ok_count, fail_count = 0, 0
    for county in counties:
        ok, message = _run_one(county, args.raster, args.variable, observation_date, args.source, args.nodata, args.dry_run)
        print(message)
        ok_count += 1 if ok else 0
        fail_count += 0 if ok else 1

    if len(counties) > 1:
        print(f"\n{ok_count} succeeded, {fail_count} failed" + (" (dry run, nothing written)" if args.dry_run else ""))

    return 1 if fail_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
