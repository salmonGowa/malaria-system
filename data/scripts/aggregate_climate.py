#!/usr/bin/env python3
import argparse
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

from cases.models import ClimateObservation, County


SUPPORTED_VARIABLES = {"rainfall_mm", "temperature_c", "humidity_pct"}


def _geometry_from_county_boundary(boundary):
    if boundary is None:
        raise ValueError("This county has no boundary geometry; add it in the admin before aggregating climate data.")
    try:
        geojson = json.loads(boundary.geojson)
    except AttributeError:
        geojson = json.loads(boundary)
    return shape(geojson)


def aggregate_raster_to_polygon(raster_path, polygon):
    """Return the mean raster value over a polygon."""
    raster_path = Path(raster_path)
    if not raster_path.exists():
        raise FileNotFoundError(f"Raster file not found: {raster_path}")

    with rasterio.open(raster_path) as src:
        if src.crs is None:
            raise ValueError(f"Raster {raster_path} has no CRS; add a georeferenced raster before aggregation.")

        gdf = gpd.GeoDataFrame(geometry=[polygon], crs="EPSG:4326")
        if gdf.crs != src.crs:
            gdf = gdf.to_crs(src.crs)

        out_image, _ = mask(
            src,
            gdf.geometry.tolist(),
            crop=True,
            all_touched=False,
            nodata=np.nan,
            filled=False,
        )

        values = out_image.astype(float)
        valid = values[~np.isnan(values)]
        if valid.size == 0:
            raise ValueError(f"No raster values overlap the county polygon for {raster_path}.")
        return float(valid.mean())


def aggregate_county_raster_for_date(county, raster_path, variable, observation_date, source):
    if variable not in SUPPORTED_VARIABLES:
        raise ValueError(f"Unsupported variable '{variable}'. Expected one of: {sorted(SUPPORTED_VARIABLES)}")

    polygon = _geometry_from_county_boundary(county.boundary)
    value = aggregate_raster_to_polygon(raster_path, polygon)

    defaults = {field: None for field in ("rainfall_mm", "temperature_c", "humidity_pct")}
    defaults[variable] = value

    obj, created = ClimateObservation.objects.update_or_create(
        county=county,
        observation_date=observation_date,
        source=source,
        defaults=defaults,
    )
    return obj, created


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


def main(argv=None):
    parser = argparse.ArgumentParser(description="Aggregate a raster file to a county-level monthly climate observation.")
    parser.add_argument("--county-id", type=int, help="County primary key to aggregate")
    parser.add_argument("--county-name", help="County name to aggregate")
    parser.add_argument("--raster", required=True, help="Path to the raster file to aggregate")
    parser.add_argument("--variable", required=True, choices=sorted(SUPPORTED_VARIABLES), help="Climate field to write to")
    parser.add_argument("--source", required=True, help="Source label, e.g. CHIRPS or ERA5")
    parser.add_argument("--date", required=True, help="Observation date in YYYY-MM-DD or YYYY-MM format")
    parser.add_argument("--dry-run", action="store_true", help="Compute the value without writing to the database")

    args = parser.parse_args(argv)

    if not args.county_id and not args.county_name:
        parser.error("Either --county-id or --county-name is required.")

    if args.county_id is not None:
        county = County.objects.get(pk=args.county_id)
    else:
        county = County.objects.get(name=args.county_name)

    observation_date = parse_date(args.date)
    polygon = _geometry_from_county_boundary(county.boundary)
    value = aggregate_raster_to_polygon(args.raster, polygon)

    if args.dry_run:
        print(f"{county.name}: {args.variable}={value:.4f} on {observation_date} ({args.source})")
        return 0

    defaults = {field: None for field in ("rainfall_mm", "temperature_c", "humidity_pct")}
    defaults[args.variable] = value
    obj, created = ClimateObservation.objects.update_or_create(
        county=county,
        observation_date=observation_date,
        source=args.source,
        defaults=defaults,
    )
    print(
        f"{'created' if created else 'updated'} {county.name} {args.variable}={value:.4f} "
        f"for {observation_date} from {args.source} (id={obj.pk})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
