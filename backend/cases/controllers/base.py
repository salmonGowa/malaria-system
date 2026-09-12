class ReadOnlyController:
    """Mediates between a read-only ViewSet and its service.

    Set `service_class` on a subclass. The view never talks to the service
    directly — it goes through the controller, even when today that just means
    passing the call through, so request-shaped concerns (the requesting user,
    query params) have one place to be added later without touching the view.
    """

    service_class = None

    def __init__(self, service=None):
        self.service = service or self.service_class()

    def list_queryset(self, request):
        return self.service.get_queryset()
