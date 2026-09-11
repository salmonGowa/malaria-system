from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticatedOrReadOnly

from .models import CaseReport, ClimateObservation, County, ForecastRun, HealthFacility, VaccineAllocation
from .serializers import (
    CaseReportSerializer,
    ClimateObservationSerializer,
    CountySerializer,
    ForecastRunSerializer,
    HealthFacilitySerializer,
    VaccineAllocationSerializer,
)


class CountyViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = County.objects.all()
    serializer_class = CountySerializer
    filterset_fields = ["is_endemic_focus"]


class HealthFacilityViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = HealthFacility.objects.select_related("county").all()
    serializer_class = HealthFacilitySerializer
    filterset_fields = ["county", "level"]


class CaseReportViewSet(
    mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Create and list only — CaseReport is immutable/append-only by design
    (see CaseReport.save/delete). No update or delete endpoints are exposed."""

    queryset = CaseReport.objects.select_related("county", "facility", "reported_by").all()
    serializer_class = CaseReportSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_fields = ["county", "facility", "report_date"]


class ClimateObservationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ClimateObservation.objects.select_related("county").all()
    serializer_class = ClimateObservationSerializer
    filterset_fields = ["county", "source"]


class ForecastRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ForecastRun.objects.select_related("county").all()
    serializer_class = ForecastRunSerializer
    filterset_fields = ["county", "model_name"]


class VaccineAllocationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = VaccineAllocation.objects.select_related("county").all()
    serializer_class = VaccineAllocationSerializer
    filterset_fields = ["county"]
