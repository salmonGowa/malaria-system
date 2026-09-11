# Where to get data

You don't have data yet, so here's what's realistically accessible for an
undergraduate-scale project, matching what the proposal itself commits to
(1.6 Scope; 3.2 Tools and Techniques; Risk table in 1.8).

## Case data

| Source | What it gives you | Access reality |
|---|---|---|
| **WHO World Malaria Report 2024 + country profile** | National and some sub-national annual figures, trend narrative | Public PDF/data annexes; good for context and validation, too coarse (annual, national) to train a county-level monthly model alone |
| **DHIS2 Kenya (MoH)** | Facility-level monthly case counts, the actual system Kenya's health facilities report into | Requires an account and MoH/county approval for granular access — this is very likely to be slow or unavailable within your timeline. Treat as a stretch goal, not the plan |
| **KEMRI publications / Malaria Atlas Project (MAP)** | Modelled incidence and prevalence surfaces at sub-national resolution, already published for research use | Public, downloadable (rasters/CSVs), designed for exactly this kind of secondary analysis — **this is your most realistic real-data source** |
| **Severe Malaria Observatory country page** | Summary stats you already cited in Chapter 1 | Public, but summary-level only |

**Practical recommendation:** start with Malaria Atlas Project county/district-level
estimates for Kenya. If DHIS2 access comes through later, treat it as a bonus
upgrade to the dataset, not a blocker — the risk table already names this
("Limited access to granular data → supplement with synthetic/simulated data")
so building the pipeline to work with MAP data from day one is the version of the
plan that doesn't depend on an approval you don't control.

## Climate data

| Source | Variable | Access |
|---|---|---|
| **CHIRPS** (Climate Hazards Center) | Daily/monthly rainfall estimates, ~5km grid, Africa-wide | Public, no login, downloadable via their data portal or Google Earth Engine |
| **ERA5 (Copernicus/ECMWF)** | Temperature, humidity, reanalysis | Public, free Copernicus account, downloadable via their API (`cdsapi` Python package) |

Both are exactly what the proposal names in 1.8 and 3.2 — no substitution needed.

## What "county-level" actually means for CHIRPS/ERA5

Both are gridded (raster) products, not county tables. You'll need to spatially
aggregate: take the county boundary (already a `MultiPolygonField` on `County` in
this scaffold) and average the grid cells that fall inside it, per month. This is
a standard `rasterio` + `geopandas` operation — worth doing as its own small
script (`data/scripts/aggregate_climate.py`, not built yet) rather than inline in
the Django app, since it's a batch job you'll re-run, not a request-time
computation.

## Suggested next step

Before touching the ML model, get one county's MAP case data and one county's
CHIRPS/ERA5 climate data into `ClimateObservation`/a case-data equivalent and
plot them side by side (Pandas/Matplotlib, as 3.2 already specifies). That
confirms the join actually works and the seasonal signal is visible before you
spend time on model selection.
