from ..services.historical_case_data_service import HistoricalCaseDataService
from .base import ReadOnlyController


class HistoricalCaseDataController(ReadOnlyController):
    service_class = HistoricalCaseDataService
