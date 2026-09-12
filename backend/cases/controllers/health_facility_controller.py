from ..services.health_facility_service import HealthFacilityService
from .base import ReadOnlyController


class HealthFacilityController(ReadOnlyController):
    service_class = HealthFacilityService
