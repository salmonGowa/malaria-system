from ..services.climate_observation_service import ClimateObservationService
from .base import ReadOnlyController


class ClimateObservationController(ReadOnlyController):
    service_class = ClimateObservationService
