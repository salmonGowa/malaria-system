import json

from rest_framework import serializers

from .models import (
    CaseReport,
    ClimateObservation,
    County,
    ForecastRun,
    HealthFacility,
    HistoricalCaseData,
    VaccineAllocation,
)


class CountySerializer(serializers.ModelSerializer):
    # Plain dict, not GeoJSONField from djangorestframework-gis (not a project
    # dependency) — GEOSGeometry already has a .geojson property, so this is
    # just parsing that back into a JSON-serializable dict.
    boundary = serializers.SerializerMethodField()

    class Meta:
        model = County
        fields = ["id", "name", "code", "is_endemic_focus", "population", "boundary"]

    def get_boundary(self, obj):
        return json.loads(obj.boundary.geojson) if obj.boundary else None


class HealthFacilitySerializer(serializers.ModelSerializer):
    county_name = serializers.CharField(source="county.name", read_only=True)
    location = serializers.SerializerMethodField()

    class Meta:
        model = HealthFacility
        fields = ["id", "name", "county", "county_name", "level", "kmhfl_code", "location"]

    def get_location(self, obj):
        return json.loads(obj.location.geojson) if obj.location else None


class CaseReportSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    county_name = serializers.CharField(source="county.name", read_only=True)
    reported_by_username = serializers.CharField(source="reported_by.username", read_only=True)
    # Reverse of `supersedes`: at most one report should ever correct a given
    # report (CaseReportService.create_report enforces that), so surface it
    # as a single nullable id rather than a list — lets the UI grey out
    # "Correct" on a report that's already been corrected without a second
    # request per row.
    superseded_by_id = serializers.SerializerMethodField()

    class Meta:
        model = CaseReport
        fields = [
            "id",
            "county",
            "county_name",
            "facility",
            "facility_name",
            "report_date",
            "confirmed_cases",
            "suspected_cases",
            "deaths",
            "reported_by",
            "reported_by_username",
            "supersedes",
            "superseded_by_id",
            "created_at",
            "previous_hash",
            "record_hash",
        ]
        read_only_fields = ["reported_by", "created_at", "previous_hash", "record_hash"]
        # Note: this serializer is validation/representation only. Creation
        # (stamping `reported_by`, calling CaseReport.objects.create) happens in
        # CaseReportController -> CaseReportService, not here.

    def get_superseded_by_id(self, obj):
        current = obj.superseded_by.order_by("-id").first()
        return current.id if current else None


class ClimateObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClimateObservation
        fields = ["id", "county", "observation_date", "rainfall_mm", "temperature_c", "humidity_pct", "source"]


class HistoricalCaseDataSerializer(serializers.ModelSerializer):
    county_name = serializers.CharField(source="county.name", read_only=True)

    class Meta:
        model = HistoricalCaseData
        fields = ["id", "county", "county_name", "period_start", "confirmed_cases", "source"]


class ForecastRunSerializer(serializers.ModelSerializer):
    county_name = serializers.CharField(source="county.name", read_only=True)
    generated_by_username = serializers.CharField(source="generated_by.username", read_only=True, default=None)

    class Meta:
        model = ForecastRun
        fields = [
            "id",
            "county",
            "county_name",
            "forecast_period_start",
            "forecast_period_end",
            "predicted_cases",
            "risk_score",
            "model_name",
            "model_version",
            "generated_at",
            "generated_by_username",
        ]


class VaccineAllocationSerializer(serializers.ModelSerializer):
    county_name = serializers.CharField(source="county.name", read_only=True)
    generated_by_username = serializers.CharField(source="generated_by.username", read_only=True, default=None)

    class Meta:
        model = VaccineAllocation
        fields = [
            "id",
            "county",
            "county_name",
            "period_start",
            "period_end",
            "recommended_doses",
            "based_on_forecast",
            "rationale",
            "generated_at",
            "generated_by_username",
        ]
