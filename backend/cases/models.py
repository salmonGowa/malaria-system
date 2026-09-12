import hashlib

from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.db import models


class County(models.Model):
    """One of Kenya's 47 counties (or a subset — the proposal scopes this to the
    lake-region and coastal endemic counties initially)."""

    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=10, unique=True, help_text="County code, e.g. KEN-047")
    is_endemic_focus = models.BooleanField(
        default=True, help_text="In the project's initial endemic-county scope"
    )
    boundary = gis_models.MultiPolygonField(null=True, blank=True, help_text="County boundary geometry")
    population = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "counties"
        ordering = ["name"]

    def __str__(self):
        return self.name


class HealthFacility(models.Model):
    class FacilityLevel(models.TextChoices):
        DISPENSARY = "dispensary", "Dispensary"
        HEALTH_CENTRE = "health_centre", "Health Centre"
        COMMUNITY_UNIT = "community_unit", "Community Health Unit"
        HOSPITAL = "hospital", "Hospital"

    name = models.CharField(max_length=200)
    county = models.ForeignKey(County, on_delete=models.PROTECT, related_name="facilities")
    level = models.CharField(max_length=20, choices=FacilityLevel.choices)
    location = gis_models.PointField(null=True, blank=True)
    kmhfl_code = models.CharField(
        max_length=50, blank=True, help_text="Kenya Master Health Facility List code, if known"
    )

    class Meta:
        ordering = ["county__name", "name"]

    def __str__(self):
        return f"{self.name} ({self.county.name})"


class CaseReport(models.Model):
    """Append-only, hash-chained malaria case report.

    Each record's `record_hash` is computed over its own content plus the previous
    record's hash, forming a simple tamper-evident chain (the "auditable data trail"
    principle from the proposal's literature review, without needing actual
    blockchain infrastructure). Records are immutable after creation: `save()`
    refuses updates and `delete()` is disabled. Corrections are handled by creating
    a new report that references the one it supersedes, never by editing history.
    """

    county = models.ForeignKey(County, on_delete=models.PROTECT, related_name="case_reports")
    facility = models.ForeignKey(HealthFacility, on_delete=models.PROTECT, related_name="case_reports")
    report_date = models.DateField(help_text="Date the reporting period ends")
    confirmed_cases = models.PositiveIntegerField()
    suspected_cases = models.PositiveIntegerField(default=0)
    deaths = models.PositiveIntegerField(default=0)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="case_reports"
    )
    supersedes = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="superseded_by",
        help_text="If this report corrects an earlier one, link it here instead of editing history",
    )
    created_at = models.DateTimeField(editable=False)
    previous_hash = models.CharField(max_length=64, blank=True)
    record_hash = models.CharField(max_length=64, blank=True, editable=False, db_index=True)

    class Meta:
        ordering = ["-report_date", "county__name"]
        indexes = [models.Index(fields=["county", "report_date"])]

    def __str__(self):
        return f"{self.facility} — {self.report_date}: {self.confirmed_cases} confirmed"

    def _compute_hash(self) -> str:
        payload = "|".join(
            [
                self.previous_hash,
                str(self.county_id),
                str(self.facility_id),
                str(self.report_date),
                str(self.confirmed_cases),
                str(self.suspected_cases),
                str(self.deaths),
                str(self.reported_by_id),
                str(self.created_at),
            ]
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def save(self, *args, **kwargs):
        # created_at is deliberately NOT auto_now_add: that field type overwrites
        # whatever value is set at save time, which would silently invalidate the
        # hash below (computed before Django's own pre_save touches the row).
        # Setting it here, once, before hashing keeps the two in sync.
        if self.pk is not None:
            raise ValueError("CaseReport records are immutable; create a new report with `supersedes` set instead.")
        if not self.created_at:
            from django.utils import timezone

            self.created_at = timezone.now()
        last = CaseReport.objects.order_by("-id").first()
        self.previous_hash = last.record_hash if last else ""
        self.record_hash = self._compute_hash()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("CaseReport records cannot be deleted; they are part of an append-only audit chain.")

    def verify_chain_link(self) -> bool:
        """Recompute this record's hash and confirm it matches what's stored."""
        return self.record_hash == self._compute_hash()


class HistoricalCaseData(models.Model):
    """Monthly county-level case counts used to train/evaluate the forecasting
    model. Deliberately NOT part of CaseReport's hash chain: that chain exists
    to make the *live* facility reporting trail tamper-evident, and backfilling
    it with years of bulk historical/modelled figures would blur exactly the
    distinction it exists to preserve — an auditor reading the chain should
    find only real, individually-attributed facility submissions there.

    Kenya's live reporting systems don't have county-level monthly history at
    the 5-year depth this project's forecasting objective needs (see
    docs/data-sources.md), so this table's `source` field always records
    exactly where each row's number came from, including "synthetic_v1" for
    modelled rows — so a synthetic figure is never mistaken for an observed
    one. See data/scripts/generate_synthetic_case_history.py for how
    synthetic rows are produced and exactly what they're calibrated against.
    """

    county = models.ForeignKey(County, on_delete=models.CASCADE, related_name="historical_case_data")
    period_start = models.DateField(help_text="First day of the month this observation covers")
    confirmed_cases = models.FloatField(help_text="Confirmed cases for the month (observed or modelled)")
    source = models.CharField(max_length=100, help_text="e.g. synthetic_v1, MAP, WHO, DHIS2")

    class Meta:
        ordering = ["county__name", "period_start"]
        constraints = [
            models.UniqueConstraint(
                fields=["county", "period_start", "source"], name="unique_historical_case_per_source"
            )
        ]

    def __str__(self):
        return f"{self.county} — {self.period_start:%Y-%m} ({self.source}): {self.confirmed_cases:.0f}"


class ClimateObservation(models.Model):
    county = models.ForeignKey(County, on_delete=models.CASCADE, related_name="climate_observations")
    observation_date = models.DateField()
    rainfall_mm = models.FloatField(null=True, blank=True, help_text="From CHIRPS or similar")
    temperature_c = models.FloatField(null=True, blank=True, help_text="From ERA5 or similar")
    humidity_pct = models.FloatField(null=True, blank=True)
    source = models.CharField(max_length=100, blank=True, help_text="e.g. CHIRPS, ERA5")

    class Meta:
        ordering = ["-observation_date", "county__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["county", "observation_date", "source"], name="unique_climate_obs_per_source"
            )
        ]

    def __str__(self):
        return f"{self.county} — {self.observation_date}"


class ForecastRun(models.Model):
    """One forecasting model run's output for a county/period, produced by the
    ml_service. Stored here so the dashboard and allocation module can query
    history without re-calling the ML service."""

    county = models.ForeignKey(County, on_delete=models.CASCADE, related_name="forecast_runs")
    forecast_period_start = models.DateField()
    forecast_period_end = models.DateField()
    predicted_cases = models.FloatField()
    risk_score = models.FloatField(help_text="Normalised 0-1 outbreak risk score")
    model_name = models.CharField(max_length=100, help_text="e.g. xgboost_v1, seir_baseline")
    model_version = models.CharField(max_length=50, blank=True)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-generated_at"]

    def __str__(self):
        return f"{self.county} forecast {self.forecast_period_start} ({self.model_name})"


class VaccineAllocation(models.Model):
    """A recommended (not executed) allocation of vaccine doses to a county for a
    period, produced by the optimisation module."""

    county = models.ForeignKey(County, on_delete=models.CASCADE, related_name="allocations")
    period_start = models.DateField()
    period_end = models.DateField()
    recommended_doses = models.PositiveIntegerField()
    based_on_forecast = models.ForeignKey(
        ForecastRun, on_delete=models.SET_NULL, null=True, blank=True, related_name="allocations"
    )
    rationale = models.TextField(blank=True)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-generated_at"]

    def __str__(self):
        return f"{self.county} — {self.recommended_doses} doses ({self.period_start})"
