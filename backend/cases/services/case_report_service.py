from ..models import CaseReport


class CaseReportService:
    """Business logic for case reports.

    CaseReport is append-only and hash-chained (see CaseReport.save/delete) — this
    is the one resource in the app with real domain rules, which is why it gets a
    bespoke service instead of the shared ReadOnlyService base.
    """

    def get_queryset(self):
        return CaseReport.objects.select_related("county", "facility", "reported_by").all()

    def create_report(self, *, validated_data, reported_by):
        """Create a new report. `reported_by` comes from the requesting user, not
        the request body — the controller is responsible for supplying it."""
        return CaseReport.objects.create(reported_by=reported_by, **validated_data)
