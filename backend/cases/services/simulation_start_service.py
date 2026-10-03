"""A real-county starting point for the dashboard's outbreak simulator.

Fills in what the county's own data can support — population, how many
people are infectious now, and its rainfall seasonality — and deliberately
NOT the transmission rate. Fitting a human-only SEIR (no reinfection) to
years of endemic malaria history gives meaningless rates (the model can
only "burn through" a population once), so the rate stays the user's
assumption and the UI says so.
"""
from datetime import date

from django.db.models import Avg
from django.db.models.functions import ExtractMonth

from ..models import ClimateObservation, County, HistoricalCaseData

# Mean days a case stays infectious — matches the simulator's default.
INFECTIOUS_DAYS = 14
DAYS_PER_MONTH = 365.25 / 12
RECENT_MONTHS = 3
MAX_INFECTIOUS_SHARE = 0.2  # never start with more than 20% of people infectious


class SimulationStartError(RuntimeError):
    pass


class SimulationStartService:
    def for_county(self, county: County, today: date | None = None):
        today = today or date.today()
        if not county.population:
            raise SimulationStartError(f"{county.name} has no population set — add it on the county's page first.")

        recent = list(
            HistoricalCaseData.objects.filter(county=county, source="synthetic_v1").order_by("-period_start")[:RECENT_MONTHS]
        )
        if not recent:
            raise SimulationStartError(f"{county.name} has no case history loaded — set it up on the Counties page first.")

        # Each confirmed case counted as one infection: a floor, since real
        # malaria is under-reported. Monthly incidence x days infectious /
        # days per month ~ people infectious at any one time.
        latest = recent[0]
        infectious_now = latest.confirmed_cases / DAYS_PER_MONTH * INFECTIOUS_DAYS
        infectious_now = max(1, min(round(infectious_now), int(county.population * MAX_INFECTIOUS_SHARE)))

        monthly = dict(
            ClimateObservation.objects.filter(county=county, source="CHIRPS", rainfall_mm__isnull=False)
            .annotate(month=ExtractMonth("observation_date"))
            .values_list("month")
            .annotate(mean=Avg("rainfall_mm"))
        )
        seasonal = [round(monthly[m], 1) for m in range(1, 13)] if len(monthly) == 12 else None

        return {
            "county": county.id,
            "county_name": county.name,
            "population": county.population,
            "initial_infectious": infectious_now,
            "latest_month": latest.period_start.isoformat(),
            "latest_month_cases": latest.confirmed_cases,
            "recent_monthly_cases": [
                {"month": r.period_start.isoformat(), "cases": r.confirmed_cases} for r in reversed(recent)
            ],
            "seasonal_rainfall_mm": seasonal,
            "start_month": today.month,
            "assumptions": [
                "Each confirmed case counts as one infection — a floor, since malaria is under-reported.",
                f"People stay infectious for about {INFECTIOUS_DAYS} days.",
                "Cases and the rainfall pattern are this county's own; the transmission rate is still your assumption.",
            ],
        }
