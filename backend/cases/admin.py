from django.contrib import admin

from .models import CaseReport, ClimateObservation, County, ForecastRun, HealthFacility, VaccineAllocation


@admin.register(County)
class CountyAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "is_endemic_focus", "population"]
    search_fields = ["name", "code"]


@admin.register(HealthFacility)
class HealthFacilityAdmin(admin.ModelAdmin):
    list_display = ["name", "county", "level", "kmhfl_code"]
    list_filter = ["county", "level"]
    search_fields = ["name", "kmhfl_code"]


@admin.register(CaseReport)
class CaseReportAdmin(admin.ModelAdmin):
    list_display = ["facility", "county", "report_date", "confirmed_cases", "deaths", "reported_by", "created_at"]
    list_filter = ["county", "report_date"]
    readonly_fields = ["previous_hash", "record_hash", "created_at"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ClimateObservation)
class ClimateObservationAdmin(admin.ModelAdmin):
    list_display = ["county", "observation_date", "rainfall_mm", "temperature_c", "humidity_pct", "source"]
    list_filter = ["county", "source"]


@admin.register(ForecastRun)
class ForecastRunAdmin(admin.ModelAdmin):
    list_display = ["county", "forecast_period_start", "predicted_cases", "risk_score", "model_name"]
    list_filter = ["county", "model_name"]


@admin.register(VaccineAllocation)
class VaccineAllocationAdmin(admin.ModelAdmin):
    list_display = ["county", "period_start", "recommended_doses", "based_on_forecast"]
    list_filter = ["county"]
