"""Makes a county forecast-ready from the dashboard, and reports how ready
each county is.

A forecast needs, per county: a boundary (CountyBoundaryService), monthly
CHIRPS rainfall, the synthetic temperature/humidity climatology, and the
synthetic case history the model was trained on (see
ForecastGenerationService._recent_history). For the 14 original counties
those come from the data/scripts/ pipeline run by hand; `prepare` runs the
same functions for one county:

  1. Rainfall — REAL: data/scripts/aggregate_climate.py's aggregation of
     every local CHIRPS raster (data/raw/chirps) over the county's polygon.
  2. Temperature/humidity — synthetic_climatology_v1, via
     generate_synthetic_climatology.climatology_values().
  3. Case history — synthetic_v1, via generate_synthetic_case_history.
     generate_series(), driven by the real rainfall from step 1.

Steps 2-3 need per-county parameters the scripts keep in hard-coded tables
for the original counties. A newly added county instead uses its malaria
epidemiological zone (Kenya National Malaria Strategy's five zones), with
the zone-typical values below — order-of-magnitude approximations in the
same spirit as those tables, not measurements. Everything written is tagged
with the same `source` labels as the original pipeline, so synthetic data
is never mistaken for an observation.
"""
import re
from datetime import date
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Count

from ..models import ClimateObservation, County, HealthFacility, HistoricalCaseData

CHIRPS_DIR = Path(settings.BASE_DIR).parent / "data" / "raw" / "chirps"
CHIRPS_NAME = re.compile(r"chirps-v2\.0\.(\d{4})\.(\d{2})\.tif$")
MIN_MONTHS = 3  # the trained model's own minimum history (see ForecastRequest)

ZONES = {
    "lake_endemic": {
        "label": "Lake endemic",
        "description": "Stable, high transmission all year — the Lake Victoria basin (e.g. Kisumu, Siaya).",
        "annual_cases_per_1000": 220.0,
        "climatology": {"temp_mean": 22.5, "temp_amp": 1.5, "humidity_mean": 68, "humidity_amp": 8},
    },
    "coast_endemic": {
        "label": "Coast endemic",
        "description": "Seasonal-to-stable transmission on the coast (e.g. Kwale, Kilifi).",
        "annual_cases_per_1000": 110.0,
        "climatology": {"temp_mean": 26.5, "temp_amp": 2.0, "humidity_mean": 78, "humidity_amp": 6},
    },
    "highland_epidemic": {
        "label": "Highland epidemic-prone",
        "description": "Western highlands; low most years with epidemics after unusual rain (e.g. Kisii, Nyamira).",
        "annual_cases_per_1000": 60.0,
        "climatology": {"temp_mean": 19.5, "temp_amp": 1.8, "humidity_mean": 72, "humidity_amp": 7},
    },
    "seasonal": {
        "label": "Seasonal (arid / semi-arid)",
        "description": "Short transmission seasons after the rains, in arid and semi-arid counties (e.g. Machakos, Kitui).",
        "annual_cases_per_1000": 30.0,
        "climatology": {"temp_mean": 24.0, "temp_amp": 2.5, "humidity_mean": 58, "humidity_amp": 10},
    },
    "low_risk": {
        "label": "Low risk",
        "description": "Central highlands and Nairobi, where transmission is rare.",
        "annual_cases_per_1000": 5.0,
        "climatology": {"temp_mean": 18.5, "temp_amp": 1.5, "humidity_mean": 65, "humidity_amp": 8},
    },
}


class CountyDataError(RuntimeError):
    pass


def chirps_rasters():
    """[(month, path)] for every local CHIRPS raster, oldest first."""
    rows = []
    for path in CHIRPS_DIR.glob("chirps-v2.0.*.tif"):
        m = CHIRPS_NAME.search(path.name)
        if m:
            rows.append((date(int(m.group(1)), int(m.group(2)), 1), path))
    return sorted(rows)


class CountyDataService:
    def readiness_all(self):
        """{county_id: readiness dict} for every county, in three queries."""
        def counts(qs, field):
            return dict(qs.values_list("county").annotate(n=Count(field)))

        rainfall = counts(ClimateObservation.objects.filter(source="CHIRPS", rainfall_mm__isnull=False), "id")
        climatology = counts(
            ClimateObservation.objects.filter(source="synthetic_climatology_v1", temperature_c__isnull=False), "id"
        )
        cases = counts(HistoricalCaseData.objects.filter(source="synthetic_v1"), "id")
        facilities = counts(HealthFacility.objects.all(), "id")
        return {
            c.id: self._readiness(c, rainfall.get(c.id, 0), climatology.get(c.id, 0), cases.get(c.id, 0), facilities.get(c.id, 0))
            for c in County.objects.all()
        }

    def readiness(self, county):
        return self.readiness_all()[county.id]

    @staticmethod
    def _readiness(county, rainfall, climatology, cases, facilities):
        has_boundary = county.boundary is not None
        return {
            "has_boundary": has_boundary,
            "rainfall_months": rainfall,
            "climatology_months": climatology,
            "case_months": cases,
            "facilities": facilities,
            # Forecasting itself only needs the history; a facility is needed
            # for *new* case reports, so it's reported but doesn't gate this.
            "forecast_ready": has_boundary and rainfall >= MIN_MONTHS and cases >= MIN_MONTHS,
        }

    @transaction.atomic
    def prepare(self, county, zone):
        """Load rainfall, climatology and case history for one county.
        Idempotent: re-running updates the same rows rather than duplicating."""
        # Imported here, not at module level: these scripts call django.setup()
        # on import and pull in rasterio/geopandas, which only this path needs.
        from data.scripts.aggregate_climate import aggregate_county_raster_for_date
        from data.scripts.generate_synthetic_case_history import SOURCE as CASE_SOURCE, add_months, generate_series
        from data.scripts.generate_synthetic_climatology import SOURCE as CLIMATOLOGY_SOURCE, climatology_values

        if zone not in ZONES:
            raise CountyDataError(f"Unknown zone {zone!r}. Choose one of: {', '.join(ZONES)}.")
        if county.boundary is None:
            raise CountyDataError(f"{county.name} has no boundary yet — locate it on the map first.")
        rasters = chirps_rasters()
        if not rasters:
            raise CountyDataError(f"No CHIRPS rasters found in {CHIRPS_DIR}.")
        profile = ZONES[zone]

        # 1. Real rainfall over the county polygon, one value per raster month.
        rainfall_by_month, failed = {}, []
        for month, path in rasters:
            try:
                value, _ = aggregate_county_raster_for_date(county, path, "rainfall_mm", month, "CHIRPS")
                rainfall_by_month[month] = value
            except (ValueError, FileNotFoundError) as exc:
                failed.append(f"{month:%Y-%m}: {exc}")
        if len(rainfall_by_month) < MIN_MONTHS:
            raise CountyDataError(f"Rainfall could be computed for only {len(rainfall_by_month)} months. " + "; ".join(failed[:3]))
        months = [m for m, _ in rasters]

        # 2. Synthetic temperature/humidity for the zone.
        for month, temp, humidity in climatology_values(profile["climatology"], months):
            obs, _ = ClimateObservation.objects.get_or_create(county=county, observation_date=month, source=CLIMATOLOGY_SOURCE)
            obs.temperature_c = temp
            obs.humidity_pct = humidity
            obs.save(update_fields=["temperature_c", "humidity_pct"])

        # 3. Synthetic case history, driven by the real rainfall above (with
        #    the two months before the window for the lag terms, if present).
        lead = {
            o.observation_date: o.rainfall_mm
            for o in ClimateObservation.objects.filter(
                county=county, source="CHIRPS", observation_date__gte=add_months(months[0], -2), rainfall_mm__isnull=False
            )
        }
        series = generate_series(county, {**lead, **rainfall_by_month}, months, annual_rate=profile["annual_cases_per_1000"])
        for month, cases in series.items():
            HistoricalCaseData.objects.update_or_create(
                county=county, period_start=month, source=CASE_SOURCE, defaults={"confirmed_cases": cases}
            )

        return {
            "zone": zone,
            "months": len(months),
            "first_month": months[0].isoformat(),
            "last_month": months[-1].isoformat(),
            "rainfall_months": len(rainfall_by_month),
            "rainfall_failed": failed,
            "readiness": self.readiness(county),
        }
