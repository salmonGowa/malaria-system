"""Load real county boundary geometry from GADM into existing County rows.

The scaffold seeds County.boundary with placeholder rectangles (see
docs/data-sources.md) — fine for exercising the map/API, not for climate
aggregation, where the polygon shape and location directly determine which
raster cells get averaged. This pulls GADM's Kenya level-1 (county)
boundaries and updates any County whose `name` matches, by name only — it
never creates new County rows, since that needs authoritative code/population
data this script doesn't have.

Source: GADM v4.1, https://gadm.org (free for academic/non-commercial use;
this project is an undergraduate research prototype).

Usage:
    data/scripts/load_county_boundaries.py --download
    data/scripts/load_county_boundaries.py --source /path/to/gadm41_KEN_1.json
    data/scripts/load_county_boundaries.py --download --dry-run
"""
import argparse
import os
import sys
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

from cases.models import County  # noqa: E402

from cases.services.county_boundary_service import (  # noqa: E402
    NAME_FIELD,
    download_gadm,
    features_from_bytes,
    normalize_name as _normalize,
    to_multipolygon,
)

# Name matching and geometry conversion live in CountyBoundaryService, shared
# with the dashboard's "Locate on map" flow, so both behave identically.


def load_features(source, download):
    if download:
        return features_from_bytes(download_gadm(timeout=30), is_zip=True)
    path = Path(source)
    return features_from_bytes(path.read_bytes(), is_zip=path.suffix == ".zip")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--download", action="store_true", help="Fetch the GADM Kenya level-1 GeoJSON directly")
    src.add_argument("--source", help="Path to a local gadm41_KEN_1.json(.zip)")
    parser.add_argument("--dry-run", action="store_true", help="Report matches without writing to the database")
    args = parser.parse_args(argv)

    features = load_features(args.source, args.download)
    by_normalized_name = {_normalize(f["properties"][NAME_FIELD]): f for f in features}

    counties = list(County.objects.all())
    matched, unmatched = 0, []
    for county in counties:
        feature = by_normalized_name.get(_normalize(county.name))
        if feature is None:
            unmatched.append(county.name)
            continue

        geom = to_multipolygon(feature["geometry"])
        gadm_name = feature["properties"][NAME_FIELD]
        print(f"{county.name}: matched GADM '{gadm_name}' — {len(geom)} part(s), bbox {geom.extent}")
        if not args.dry_run:
            county.boundary = geom
            county.save(update_fields=["boundary"])
        matched += 1

    print(f"\n{matched}/{len(counties)} counties matched" + (" (dry run, nothing written)" if args.dry_run else ""))
    if unmatched:
        print(f"No GADM match for: {', '.join(unmatched)} — left unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
