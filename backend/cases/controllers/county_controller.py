from ..services.county_service import CountyService
from .base import ReadOnlyController


class CountyController(ReadOnlyController):
    service_class = CountyService

    def create(self, serializer):
        return self.service.create_county(serializer.validated_data)

    def update(self, instance, serializer):
        return self.service.update_county(instance, serializer.validated_data)
