from ..models import ForecastRun
from .base import ReadOnlyService


class ForecastRunService(ReadOnlyService):
    model = ForecastRun
    select_related = ("county", "generated_by")
