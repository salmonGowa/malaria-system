from ..models import County
from .base import ReadOnlyService


class CountyService(ReadOnlyService):
    model = County
