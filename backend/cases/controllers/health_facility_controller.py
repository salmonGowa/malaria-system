from ..services.health_facility_service import HealthFacilityService
from .base import ReadOnlyController


class HealthFacilityController(ReadOnlyController):
    service_class = HealthFacilityService

    def create(self, serializer):
        return self.service.create_facility(serializer.validated_data)

    def update(self, instance, serializer):
        return self.service.update_facility(instance, serializer.validated_data)
