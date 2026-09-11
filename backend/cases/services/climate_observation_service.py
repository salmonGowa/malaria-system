from ..models import ClimateObservation
from .base import ReadOnlyService


class ClimateObservationService(ReadOnlyService):
    model = ClimateObservation
    select_related = ("county",)
