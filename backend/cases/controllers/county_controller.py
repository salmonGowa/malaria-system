from ..services.county_service import CountyService
from .base import ReadOnlyController


class CountyController(ReadOnlyController):
    service_class = CountyService
