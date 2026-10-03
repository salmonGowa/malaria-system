from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .controllers.case_report_controller import CaseReportController
from .controllers.climate_observation_controller import ClimateObservationController
from .controllers.county_controller import CountyController
from .controllers.forecast_run_controller import ForecastRunController
from .controllers.health_facility_controller import HealthFacilityController
from .controllers.historical_case_data_controller import HistoricalCaseDataController
from .controllers.vaccine_allocation_controller import VaccineAllocationController
from .services.allocation_generation_service import AllocationGenerationError
from .services.county_boundary_service import BoundaryLookupError, CountyBoundaryService
from .services.county_data_service import ZONES, CountyDataError, CountyDataService
from .services.simulation_start_service import SimulationStartError, SimulationStartService
from .serializers import (
    CaseReportSerializer,
    ClimateObservationSerializer,
    CountySerializer,
    ForecastRunSerializer,
    HealthFacilitySerializer,
    HistoricalCaseDataSerializer,
    VaccineAllocationSerializer,
)

class CountyViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Create/update, no delete — a county with case reports, facilities, or
    forecasts attached can't be removed anyway (PROTECT on those FKs).
    `boundary` isn't settable through create/update (see CountySerializer):
    geometry only ever comes from GADM — via the boundary-suggestion /
    apply-boundary actions below, or data/scripts/load_county_boundaries.py —
    never a hand-typed or hand-drawn shape."""

    serializer_class = CountySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_fields = ["is_endemic_focus"]

    def get_queryset(self):
        return CountyController().list_queryset(self.request)

    def perform_create(self, serializer):
        serializer.instance = CountyController().create(serializer)

    def perform_update(self, serializer):
        serializer.instance = CountyController().update(serializer.instance, serializer)

    @action(detail=False, methods=["get"])
    def readiness(self, request):
        """GET /api/counties/readiness/ — per county: boundary, months of
        rainfall / climatology / case history, facilities, and whether it can
        be forecast; plus the epidemiological zones prepare-data accepts."""
        zones = [{"id": k, "label": v["label"], "description": v["description"]} for k, v in ZONES.items()]
        return Response({"zones": zones, "counties": CountyDataService().readiness_all()})

    @action(detail=True, methods=["get"], url_path="simulation-start")
    def simulation_start(self, request, pk=None):
        """GET /api/counties/{id}/simulation-start/ — real starting values for
        the outbreak simulator: population, people infectious now (from recent
        cases) and the county's rainfall seasonality. Read-only."""
        try:
            return Response(SimulationStartService().for_county(self.get_object()))
        except SimulationStartError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="prepare-data", permission_classes=[IsAuthenticated])
    def prepare_data(self, request, pk=None):
        """POST /api/counties/{id}/prepare-data/ {zone} — load real CHIRPS
        rainfall and synthetic climatology + case history for one county, so
        it can be forecast. See CountyDataService.prepare."""
        county = self.get_object()
        try:
            return Response(CountyDataService().prepare(county, request.data.get("zone", "")))
        except CountyDataError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"], url_path="boundary-suggestion", permission_classes=[IsAuthenticated])
    def boundary_suggestion(self, request, pk=None):
        """GET /api/counties/{id}/boundary-suggestion/?name= — the official GADM
        boundary matching the county's name (or ?name=), plus every GADM county
        name to pick from if it doesn't match. Read-only: nothing is saved."""
        county = self.get_object()
        try:
            return Response(CountyBoundaryService().suggest(county, request.query_params.get("name")))
        except BoundaryLookupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    @action(detail=True, methods=["post"], url_path="apply-boundary", permission_classes=[IsAuthenticated])
    def apply_boundary(self, request, pk=None):
        """POST /api/counties/{id}/apply-boundary/ {gadm_name} — save that GADM
        county's boundary as this county's geometry."""
        county = self.get_object()
        gadm_name = request.data.get("gadm_name")
        if not gadm_name:
            return Response({"detail": "gadm_name is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            county = CountyBoundaryService().apply(county, gadm_name)
        except BoundaryLookupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(CountySerializer(county).data)


class HealthFacilityViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = HealthFacilitySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_fields = ["county", "level"]

    def get_queryset(self):
        return HealthFacilityController().list_queryset(self.request)

    def perform_create(self, serializer):
        serializer.instance = HealthFacilityController().create(serializer)

    def perform_update(self, serializer):
        serializer.instance = HealthFacilityController().update(serializer.instance, serializer)


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

    @action(detail=False, methods=["get"])
    def verify_chain(self, request):
        """GET /api/case-reports/verify_chain/ — walk the whole hash chain
        and confirm it hasn't been tampered with. See
        CaseReportService.verify_chain for what "valid" actually checks."""
        return Response(CaseReportController().verify_chain(request))


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

    @action(detail=False, methods=["post"])
    def preview(self, request):
        """POST /api/forecasts/preview/ — same body and model as generate,
        but a dry run: returns what would be stored and stores nothing.
        Authenticated like generate (it costs one ml_service call per
        county). See ForecastRunController.preview."""
        previews, errors = ForecastRunController().preview(request)
        return Response({"previews": previews, "errors": errors}, status=status.HTTP_200_OK)


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
