from ..models import HealthFacility
from .base import ReadOnlyService


class HealthFacilityService(ReadOnlyService):
    model = HealthFacility
    select_related = ("county",)
