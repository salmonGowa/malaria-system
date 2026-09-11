from rest_framework import serializers

from .models import CaseReport, ClimateObservation, County, ForecastRun, HealthFacility, VaccineAllocation


class CountySerializer(serializers.ModelSerializer):
    class Meta:
        model = County
        fields = ["id", "name", "code", "is_endemic_focus", "population"]


class HealthFacilitySerializer(serializers.ModelSerializer):
    county_name = serializers.CharField(source="county.name", read_only=True)

    class Meta:
        model = HealthFacility
        fields = ["id", "name", "county", "county_name", "level", "kmhfl_code"]


class CaseReportSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    county_name = serializers.CharField(source="county.name", read_only=True)

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
            "supersedes",
            "created_at",
            "previous_hash",
            "record_hash",
        ]
        read_only_fields = ["reported_by", "created_at", "previous_hash", "record_hash"]

    def create(self, validated_data):
        validated_data["reported_by"] = self.context["request"].user
        return super().create(validated_data)


class ClimateObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClimateObservation
        fields = ["id", "county", "observation_date", "rainfall_mm", "temperature_c", "humidity_pct", "source"]


class ForecastRunSerializer(serializers.ModelSerializer):
    county_name = serializers.CharField(source="county.name", read_only=True)

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
        ]


class VaccineAllocationSerializer(serializers.ModelSerializer):
    county_name = serializers.CharField(source="county.name", read_only=True)

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
        ]
