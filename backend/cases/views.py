from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .controllers.case_report_controller import CaseReportController
from .controllers.climate_observation_controller import ClimateObservationController
from .controllers.county_controller import CountyController
from .controllers.forecast_run_controller import ForecastRunController
from .controllers.health_facility_controller import HealthFacilityController
from .controllers.historical_case_data_controller import HistoricalCaseDataController
from .controllers.vaccine_allocation_controller import VaccineAllocationController
from .services.allocation_generation_service import AllocationGenerationError
from .serializers import (
    CaseReportSerializer,
    ClimateObservationSerializer,
    CountySerializer,
    ForecastRunSerializer,
    HealthFacilitySerializer,
    HistoricalCaseDataSerializer,
    VaccineAllocationSerializer,
)

# ViewSets here are routing glue only: parse the request, hand off to a
# controller, serialize the result. Business logic lives in controllers/ and
# services/, not here.


class CountyViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CountySerializer
    filterset_fields = ["is_endemic_focus"]

    def get_queryset(self):
        return CountyController().list_queryset(self.request)


class HealthFacilityViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HealthFacilitySerializer
    filterset_fields = ["county", "level"]

    def get_queryset(self):
        return HealthFacilityController().list_queryset(self.request)


class CaseReportViewSet(
    mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Create and list only — CaseReport is immutable/append-only by design
    (see CaseReport.save/delete). No update or delete endpoints are exposed."""

    serializer_class = CaseReportSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_fields = ["county", "facility", "report_date"]

    def get_queryset(self):
        return CaseReportController().list_queryset(self.request)

    def perform_create(self, serializer):
        serializer.instance = CaseReportController().create(serializer, self.request)


class ClimateObservationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ClimateObservationSerializer
    filterset_fields = ["county", "source"]

    def get_queryset(self):
        return ClimateObservationController().list_queryset(self.request)


class HistoricalCaseDataViewSet(viewsets.ReadOnlyModelViewSet):
    """The synthetic-but-rainfall-driven training/evaluation series behind
    the forecasting model — see HistoricalCaseData's docstring. Exposed
    read-only so the dashboard can chart it; nothing writes through this API,
    only data/scripts/generate_synthetic_case_history.py does."""

    serializer_class = HistoricalCaseDataSerializer
    filterset_fields = ["county", "source"]

    def get_queryset(self):
        return HistoricalCaseDataController().list_queryset(self.request)


class ForecastRunViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ForecastRunSerializer
    filterset_fields = ["county", "model_name"]
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        return ForecastRunController().list_queryset(self.request)

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """POST /api/forecasts/generate/ — run the trained model for real
        counties and store the result. See ForecastRunController.generate."""
        created, errors = ForecastRunController().generate(request)
        return Response(
            {"created": ForecastRunSerializer(created, many=True).data, "errors": errors},
            status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
        )


class VaccineAllocationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = VaccineAllocationSerializer
    filterset_fields = ["county"]
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        return VaccineAllocationController().list_queryset(self.request)

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """POST /api/allocations/generate/ — run the optimiser against each
        county's latest stored forecast. See VaccineAllocationController.generate."""
        try:
            created = VaccineAllocationController().generate(request)
        except AllocationGenerationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except (KeyError, ValueError) as exc:
            return Response({"error": f"Invalid request: {exc}"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(VaccineAllocationSerializer(created, many=True).data, status=status.HTTP_201_CREATED)
