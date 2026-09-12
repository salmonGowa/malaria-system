from ..models import HistoricalCaseData
from .base import ReadOnlyService


class HistoricalCaseDataService(ReadOnlyService):
    model = HistoricalCaseData
    select_related = ("county",)
