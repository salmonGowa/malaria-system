from ..models import HealthFacility
from .base import ReadOnlyService


class HealthFacilityService(ReadOnlyService):
    model = HealthFacility
    select_related = ("county",)

    def create_facility(self, validated_data):
        return HealthFacility.objects.create(**validated_data)

    def update_facility(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance
