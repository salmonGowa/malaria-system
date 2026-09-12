"""Calls ml_service's /allocate using each county's latest stored ForecastRun
and stores the result as VaccineAllocation rows — the other half of Task 6.

Unlike forecast generation, allocation.py (ml_service) was already a real
implementation before this; what was missing was a caller that uses real
stored forecasts instead of request-supplied risk scores from the what-if
simulator.
"""
import requests
from django.conf import settings

from ..models import ForecastRun, VaccineAllocation


class AllocationGenerationError(RuntimeError):
    pass


class AllocationGenerationService:
    def _latest_forecasts(self, counties):
        forecasts = {}
        for county in counties:
            latest = ForecastRun.objects.filter(county=county).order_by("-generated_at").first()
            if latest:
                forecasts[county] = latest
        return forecasts

    def generate(self, counties, total_available_doses, period_start, period_end):
        forecasts = self._latest_forecasts(counties)
        if not forecasts:
            raise AllocationGenerationError(
                "None of the given counties have a stored forecast yet — generate forecasts first."
            )

        payload = {
            "total_available_doses": total_available_doses,
            "county_forecasts": [
                {
                    "county_code": county.code,
                    "forecast_period_start": forecast.forecast_period_start.isoformat(),
                    "forecast_period_end": forecast.forecast_period_end.isoformat(),
                    "predicted_cases": forecast.predicted_cases,
                    "risk_score": forecast.risk_score,
                    "model_name": forecast.model_name,
                    "model_version": forecast.model_version,
                }
                for county, forecast in forecasts.items()
            ],
            "county_populations": {county.code: county.population or 0 for county in forecasts},
        }

        try:
            response = requests.post(f"{settings.ML_SERVICE_URL}/allocate", json=payload, timeout=30)
        except requests.RequestException as exc:
            raise AllocationGenerationError(f"Could not reach ml_service: {exc}") from exc

        if response.status_code >= 400:
            raise AllocationGenerationError(f"ml_service returned {response.status_code}: {response.text}")

        data = response.json()
        by_code = {county.code: county for county in forecasts}

        created = []
        for line in data["allocations"]:
            county = by_code.get(line["county_code"])
            if county is None:
                continue
            created.append(
                VaccineAllocation.objects.create(
                    county=county,
                    period_start=period_start,
                    period_end=period_end,
                    recommended_doses=line["recommended_doses"],
                    based_on_forecast=forecasts[county],
                    rationale=line["rationale"],
                )
            )
        return created
