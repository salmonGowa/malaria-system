"""Seed/update the endemic-focus County rows this project targets.

The scaffold only ever had 5 counties created ad hoc (Django shell, not a
checked-in script) — fine for an early pilot, but not reproducible and not
enough to represent the proposal's "lake-region and coastal endemic
counties" scope. This script is the reproducible replacement: it
`update_or_create`s a fixed list of County rows by name, setting the real
official Kenya county code (Constitution of Kenya, 2010, First Schedule —
also KNBS/IEBC's numbering) and an approximate 2019 census population.

It never touches `boundary` (real GADM boundaries come from
load_county_boundaries.py, which matches by name and needs a County row to
already exist) or `is_endemic_focus` on a row that already has a value set
deliberately elsewhere.

One correction this script makes: the original 5-county seed stored Kilifi's
code as "KEN-047", which is actually Nairobi City's official code, not
Kilifi's ("KEN-003") — an artifact of assigning codes 040-047 sequentially
to whichever 5 counties existed rather than using each county's real code.
Fixed here since `code` should identify the county, not just be a unique
string.

Population figures are 2019 Kenya Population and Housing Census county
totals, rounded — approximate, not a live figure; re-seed from an updated
source if precision matters later.

Usage:
    data/scripts/seed_counties.py            # apply
    data/scripts/seed_counties.py --dry-run  # preview only
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

# name -> (official code, 2019 census population). Lake-region (Lake Victoria
# basin, western Kenya) and coastal endemic zones, per docs/architecture.md /
# the proposal's Chapter 2 scoping.
COUNTIES = {
    # Lake region — already seeded, code corrected/confirmed against the
    # official numbering:
    "Busia": ("KEN-040", 893_681),
    "Siaya": ("KEN-041", 993_183),
    "Kisumu": ("KEN-042", 1_155_574),
    "Homa Bay": ("KEN-043", 1_131_950),
    # Lake region — new:
    "Migori": ("KEN-044", 1_116_436),
    "Kisii": ("KEN-045", 1_266_860),
    "Nyamira": ("KEN-046", 605_576),
    "Kakamega": ("KEN-037", 1_867_579),
    "Vihiga": ("KEN-038", 590_013),
    "Bungoma": ("KEN-039", 1_670_570),
    # Coastal — Kilifi already seeded (code corrected from the Nairobi code
    # "KEN-047" it was mistakenly given to its real "KEN-003"); Mombasa,
    # Kwale, Taita-Taveta new:
    "Kilifi": ("KEN-003", 1_453_787),
    "Mombasa": ("KEN-001", 1_208_333),
    "Kwale": ("KEN-002", 866_820),
    "Taita Taveta": ("KEN-006", 340_671),
}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    created, updated, unchanged = 0, 0, 0
    for name, (code, population) in COUNTIES.items():
        existing = County.objects.filter(name=name).first()
        if existing is None:
            status = "CREATE"
        elif existing.code != code or existing.population != population:
            status = "UPDATE"
        else:
            status = "unchanged"

        print(f"{status:9} {name:15} code={code} population={population:,}")

        if args.dry_run:
            continue

        _, was_created = County.objects.update_or_create(
            name=name, defaults={"code": code, "population": population, "is_endemic_focus": True}
        )
        if was_created:
            created += 1
        elif status == "UPDATE":
            updated += 1
        else:
            unchanged += 1

    if not args.dry_run:
        print(f"\n{created} created, {updated} updated, {unchanged} unchanged. Total target counties: {len(COUNTIES)}")
        total = County.objects.count()
        print(f"County table now has {total} row(s) total.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
