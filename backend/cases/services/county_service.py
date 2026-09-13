from ..models import County
from .base import ReadOnlyService


class CountyService(ReadOnlyService):
    model = County

    def create_county(self, validated_data):
        # boundary is deliberately not settable here (see CountySerializer —
        # it's a read-only SerializerMethodField): geometry comes from
        # data/scripts/load_county_boundaries.py, not a hand-typed form.
        return County.objects.create(**validated_data)

    def update_county(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance
