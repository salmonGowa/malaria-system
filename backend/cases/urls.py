from django.urls import path
from rest_framework.routers import DefaultRouter

from .auth_views import LoginView, MeView
from .views import (
    CaseReportViewSet,
    ClimateObservationViewSet,
    CountyViewSet,
    ForecastRunViewSet,
    HealthFacilityViewSet,
    HistoricalCaseDataViewSet,
    VaccineAllocationViewSet,
)

router = DefaultRouter()
# basename is now explicit: these ViewSets no longer carry a `queryset` class
# attribute (get_queryset() delegates to a controller instead), which is what
# DRF's router would otherwise inspect to infer it.
router.register("counties", CountyViewSet, basename="county")
router.register("facilities", HealthFacilityViewSet, basename="healthfacility")
router.register("case-reports", CaseReportViewSet, basename="casereport")
router.register("climate-observations", ClimateObservationViewSet, basename="climateobservation")
router.register("historical-case-data", HistoricalCaseDataViewSet, basename="historicalcasedata")
router.register("forecasts", ForecastRunViewSet, basename="forecastrun")
router.register("allocations", VaccineAllocationViewSet, basename="vaccineallocation")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    *router.urls,
]
