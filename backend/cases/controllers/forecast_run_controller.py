from datetime import date

from ..models import County
from ..services.forecast_run_service import ForecastRunService
from ..services.forecast_generation_service import ForecastGenerationService
from .base import ReadOnlyController


class ForecastRunController(ReadOnlyController):
    service_class = ForecastRunService

    def generate(self, request):
        """Trigger real ml_service forecast run(s) and store them. Body:
        {county_ids?: [int], as_of_date?: "YYYY-MM-DD", horizon_weeks?: int}
        — an absent/omitted county_ids defaults to every county with a
        boundary; an explicit empty list means "none" (not "default"),
        since `[]` and "key not sent" mean different things to a caller
        even though both are falsy in Python."""
        counties = (
            County.objects.filter(pk__in=request.data["county_ids"])
            if "county_ids" in request.data
            else County.objects.exclude(boundary__isnull=True)
        )

        as_of_raw = request.data.get("as_of_date")
        as_of_date = date.fromisoformat(as_of_raw) if as_of_raw else date.today()
        horizon_weeks = int(request.data.get("horizon_weeks", 4))

        generated_by = request.user if request.user.is_authenticated else None
        return ForecastGenerationService().generate_for_counties(
            counties, as_of_date, horizon_weeks, generated_by=generated_by
        )
