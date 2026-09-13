from ..services.case_report_service import CaseReportService


class CaseReportController:
    """Mediates between CaseReportViewSet and CaseReportService.

    CaseReport is append-only with real domain rules (see CaseReportService), so
    this controller is bespoke rather than a ReadOnlyController subclass.
    """

    def __init__(self, service=None):
        self.service = service or CaseReportService()

    def list_queryset(self, request):
        return self.service.get_queryset()

    def create(self, serializer, request):
        """Create a report from a validated serializer, stamping `reported_by`
        from the request rather than trusting the request body."""
        return self.service.create_report(
            validated_data=serializer.validated_data,
            reported_by=request.user,
        )

    def verify_chain(self, request):
        return self.service.verify_chain()
