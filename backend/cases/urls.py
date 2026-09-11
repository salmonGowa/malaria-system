from rest_framework.routers import DefaultRouter

from .views import (
    CaseReportViewSet,
    ClimateObservationViewSet,
    CountyViewSet,
    ForecastRunViewSet,
    HealthFacilityViewSet,
    VaccineAllocationViewSet,
)

router = DefaultRouter()
router.register("counties", CountyViewSet)
router.register("facilities", HealthFacilityViewSet)
router.register("case-reports", CaseReportViewSet)
router.register("climate-observations", ClimateObservationViewSet)
router.register("forecasts", ForecastRunViewSet)
router.register("allocations", VaccineAllocationViewSet)

urlpatterns = router.urls
