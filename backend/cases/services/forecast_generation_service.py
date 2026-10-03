"""Calls ml_service's /forecast for real counties and stores the result —
Task 6's "wire it to real forecasts instead of request-supplied risk scores".

ml_service has no database of its own (docs/architecture.md), so this
service is the thing that gathers the trailing history it needs — recent
rainfall (real, ClimateObservation source=CHIRPS) and recent case counts
(HistoricalCaseData source=synthetic_v1, the same series the model was
trained on — see HistoricalCaseData's docstring for why real live CaseReport
volume isn't enough yet) — and sends it in the request body, since ml_service
can't query the DB itself.
"""
import requests
from django.conf import settings

from ..models import ClimateObservation, ForecastRun, HistoricalCaseData

HISTORY_MONTHS = 6  # comfortably more than the model's own 3-month minimum


class ForecastGenerationError(RuntimeError):
    pass


class ForecastGenerationService:
    def _recent_history(self, county, as_of_date, months=HISTORY_MONTHS):
        case_qs = HistoricalCaseData.objects.filter(
            county=county, source="synthetic_v1", period_start__lt=as_of_date
        ).order_by("-period_start")[:months]
        cases = list(reversed([c.confirmed_cases for c in case_qs]))

        rainfall_qs = ClimateObservation.objects.filter(
            county=county, source="CHIRPS", observation_date__lt=as_of_date, rainfall_mm__isnull=False
        ).order_by("-observation_date")[:months]
        rainfall = list(reversed([c.rainfall_mm for c in rainfall_qs]))

        climatology_qs = ClimateObservation.objects.filter(
            county=county,
            source="synthetic_climatology_v1",
            observation_date__lt=as_of_date,
            temperature_c__isnull=False,
        ).order_by("-observation_date")[:months]
        temperature = list(reversed([c.temperature_c for c in climatology_qs]))
        humidity = list(reversed([c.humidity_pct for c in climatology_qs]))

        return cases, rainfall, temperature, humidity

    def predict_for_county(self, county, as_of_date, horizon_weeks=4):
        """Run the model for one county and return ml_service's prediction
        dict — nothing is stored. Shared by generate (which saves it) and
        preview (which doesn't), so a preview is exactly what generating
        with the same inputs would save."""
        cases, rainfall, temperature, humidity = self._recent_history(county, as_of_date)
        payload = {
            "county_code": county.code,
            "as_of_date": as_of_date.isoformat(),
            "horizon_weeks": horizon_weeks,
            "population": county.population,
            "recent_confirmed_cases": cases,
            "recent_rainfall_mm": rainfall,
            "recent_temperature_c": temperature,
            "recent_humidity_pct": humidity,
        }

        try:
            response = requests.post(f"{settings.ML_SERVICE_URL}/forecast", json=payload, timeout=30)
        except requests.RequestException as exc:
            raise ForecastGenerationError(f"Could not reach ml_service: {exc}") from exc

        if response.status_code >= 400:
            raise ForecastGenerationError(f"ml_service returned {response.status_code}: {response.text}")

        return response.json()

    def generate_for_county(self, county, as_of_date, horizon_weeks=4, generated_by=None):
        data = self.predict_for_county(county, as_of_date, horizon_weeks)
        return ForecastRun.objects.create(
            county=county,
            forecast_period_start=data["forecast_period_start"],
            forecast_period_end=data["forecast_period_end"],
            predicted_cases=data["predicted_cases"],
            risk_score=data["risk_score"],
            model_name=data["model_name"],
            model_version=data["model_version"],
            generated_by=generated_by,
        )

    @staticmethod
    def _each_county(counties, run_one):
        """Never raises on one county's failure — a batch across every county
        shouldn't abort because one has too little history.
        Returns (results: list, errors: list[dict])."""
        results, errors = [], []
        for county in counties:
            try:
                results.append(run_one(county))
            except (ForecastGenerationError, KeyError, ValueError) as exc:
                errors.append({"county_code": county.code, "county_name": county.name, "error": str(exc)})
        return results, errors

    def generate_for_counties(self, counties, as_of_date, horizon_weeks=4, generated_by=None):
        """Returns (created: list[ForecastRun], errors: list[dict])."""
        return self._each_county(
            counties, lambda c: self.generate_for_county(c, as_of_date, horizon_weeks, generated_by=generated_by)
        )

    def preview_for_counties(self, counties, as_of_date, horizon_weeks=4):
        """Dry run: the same predictions generate_for_counties would store,
        returned as plain dicts and never saved. Returns (previews, errors)."""

        def preview_one(county):
            data = self.predict_for_county(county, as_of_date, horizon_weeks)
            return {
                "county": county.id,
                "county_name": county.name,
                "forecast_period_start": data["forecast_period_start"],
                "forecast_period_end": data["forecast_period_end"],
                "predicted_cases": data["predicted_cases"],
                "risk_score": data["risk_score"],
                "model_name": data["model_name"],
                "model_version": data["model_version"],
            }

        return self._each_county(counties, preview_one)
