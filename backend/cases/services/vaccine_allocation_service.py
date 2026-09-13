from ..models import VaccineAllocation
from .base import ReadOnlyService


class VaccineAllocationService(ReadOnlyService):
    model = VaccineAllocation
    select_related = ("county", "generated_by")
