# data/

Offline data-prep tooling — not imported by `backend` or `ml_service` at
request time. Install its extra deps once into the shared venv:

```bash
env/bin/pip install -r data/requirements.txt
```

## Scripts

### `scripts/load_county_boundaries.py`

The scaffold seeds `County.boundary` with placeholder rectangles. Climate
aggregation needs the real shape (and the real location — the seed rectangles
aren't even centered on the right county), so run this once before
aggregating anything:

```bash
data/scripts/load_county_boundaries.py --download --dry-run   # preview matches
data/scripts/load_county_boundaries.py --download             # write them
```

Pulls [GADM](https://gadm.org) v4.1 Kenya level-1 (county) boundaries and
updates any existing `County` row whose name matches — it never creates new
counties (that needs authoritative `code`/`population` data this script
doesn't have). Matching is name-normalized (`Homa Bay` == `HomaBay`), so it'll
keep working as more of Kenya's 47 counties get seeded.

### `scripts/aggregate_climate.py`

Spatially aggregates a CHIRPS/ERA5 raster to county-level
`ClimateObservation` rows. Three ways to run it — see the script's own
`--help` for full flag docs:

```bash
# 1. One county, one raster — sanity-check a value before trusting the pipeline
data/scripts/aggregate_climate.py --county-name Kisumu \
    --raster data/raw/chirps/chirps-v2.0.2026.07.tif \
    --variable rainfall_mm --source CHIRPS --date 2026-07 --dry-run

# 2. One raster, every county with a boundary
data/scripts/aggregate_climate.py --all-counties \
    --raster data/raw/chirps/chirps-v2.0.2026.07.tif \
    --variable rainfall_mm --source CHIRPS --date 2026-07

# 3. Many rasters x many counties — the real batch job, see manifests/ below
data/scripts/aggregate_climate.py --manifest data/manifests/chirps_pilot.csv
```

All three modes go through the same `aggregate_raster_to_polygon()` — mode 1
validates the exact code path modes 2/3 run at scale, not a simplified stand-in.

Nodata handling matters more than it looks: CHIRPS's Africa-monthly GeoTIFFs
use `-9999` as a sentinel by convention but don't reliably declare it in the
file's own metadata (`src.nodata` reads `None`). The script falls back to
`-9999` when a raster doesn't declare its own nodata value, so a county
polygon that touches an ocean/missing-tile cell raises instead of silently
averaging `-9999` in as a real value. Override with `--nodata` if a source
uses something else.

### `scripts/generate_synthetic_climatology.py`

ERA5 (temperature/humidity) needs a free Copernicus CDS account and the
`cdsapi` package this project doesn't have credentials for — see
`docs/data-sources.md`. This generates a deterministic seasonal climatology
per county instead, always tagged `source=synthetic_climatology_v1` so it's
never mistaken for a real observation. Swap it out the moment CDS
credentials exist; nothing downstream needs to change except which script
populates these `ClimateObservation` rows.

```bash
data/scripts/generate_synthetic_climatology.py --start 2021-09 --end 2026-08
```

### `scripts/generate_synthetic_case_history.py`

Real 5-year county-monthly case data isn't available within this project's
timeline (see `docs/data-sources.md` — DHIS2 needs an approval this project
doesn't have). Generates a synthetic series instead, driven by **real**
CHIRPS rainfall (not noise) plus county-specific baseline incidence and
overdispersed count noise, written to `HistoricalCaseData` with
`source=synthetic_v1` — see that model's docstring in `backend/cases/models.py`
for why this is a separate table from the real, hash-chained `CaseReport`.

```bash
data/scripts/generate_synthetic_case_history.py --start 2021-09 --end 2026-08
```

### `scripts/train_forecast_model.py`

Trains the XGBoost classifier + regressor behind `ml_service/app/forecasting.py`,
benchmarks it against `app/compartmental.py`'s SEIR model, and reports
k-fold CV + held-out test metrics honestly. See `docs/architecture.md`'s
"Model results" section for the actual numbers and what they do/don't mean.

```bash
data/scripts/train_forecast_model.py                          # defaults: 12-month test window, 5-fold CV
data/scripts/train_forecast_model.py --test-months 6 --cv-folds 10
```

Writes `ml_service/models/forecast_{classifier,regressor}.json` and
`forecast_metadata.json` (full metrics + county list + training window, for
reproducibility) — `forecasting.py` loads these at request time.

## `raw/` — not checked in

`raw/` holds downloaded rasters (`.gitignore`d — binaries, not source).
CHIRPS publishes the same data at several extents; **EAC_monthly** (East
African Community — Kenya, Uganda, Tanzania, Rwanda, Burundi, South Sudan)
is ~20x smaller than the Africa-wide product for the same resolution and
the same values over Kenya, and was the difference between a batch fetch
taking minutes vs. hours over a slow connection:

```bash
mkdir -p data/raw/chirps
curl -o data/raw/chirps/chirps-v2.0.YYYY.MM.tif.gz \
    https://data.chc.ucsb.edu/products/CHIRPS-2.0/EAC_monthly/tifs/chirps-v2.0.YYYY.MM.tif.gz
gunzip data/raw/chirps/chirps-v2.0.YYYY.MM.tif.gz
```

(`africa_monthly` at the same path structure also works, just ~20x larger
per file — only worth it if you need coverage outside East Africa.) No
login required either way. ERA5 needs your own CDS account — see
`generate_synthetic_climatology.py` above for the fallback used instead.

## `manifests/`

CSV batch jobs for `aggregate_climate.py --manifest`. Columns:
`raster,variable,source,date[,county_id|county_name][,nodata]` — leave
`county_id`/`county_name` blank to apply that row to every county with a
boundary. Relative `raster` paths resolve against the manifest file's own
location, not the caller's cwd, so a checked-in manifest works the same
regardless of where you run it from.

- `manifests/chirps_pilot.csv` — the original 2-month pilot (Task 3's first
  end-to-end sanity check, before generalizing).
- `manifests/chirps_5year.csv` — the real batch job: 60 months x every
  county with a boundary, generated by listing `data/raw/chirps/`. This is
  what `HistoricalCaseData`'s rainfall signal and the trained model are
  actually built on.
