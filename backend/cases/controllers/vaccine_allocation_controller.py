from datetime import date, timedelta

from ..models import County
from ..services.vaccine_allocation_service import VaccineAllocationService
from ..services.allocation_generation_service import AllocationGenerationService
from .base import ReadOnlyController


class VaccineAllocationController(ReadOnlyController):
    service_class = VaccineAllocationService

    def generate(self, request):
        """Trigger a real allocation run against each given county's latest
        stored forecast. Body: {total_available_doses: int, county_ids?: [int],
        period_start?: "YYYY-MM-DD", period_end?: "YYYY-MM-DD"} — county_ids
        defaults to every county with a boundary (an explicit empty list
        means "none", not "default" — see ForecastRunController.generate);
        period defaults to the next 4 weeks from today."""
        counties = (
            County.objects.filter(pk__in=request.data["county_ids"])
            if "county_ids" in request.data
            else County.objects.exclude(boundary__isnull=True)
        )

        total_available_doses = int(request.data["total_available_doses"])
        period_start_raw = request.data.get("period_start")
        period_end_raw = request.data.get("period_end")
        period_start = date.fromisoformat(period_start_raw) if period_start_raw else date.today()
        period_end = date.fromisoformat(period_end_raw) if period_end_raw else period_start + timedelta(weeks=4)

        return AllocationGenerationService().generate(counties, total_available_doses, period_start, period_end)
