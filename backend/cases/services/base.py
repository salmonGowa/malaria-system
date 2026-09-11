class ReadOnlyService:
    """Base for resources with no business logic yet beyond querying.

    Set `model` (and optionally `select_related`) on a subclass to get a working
    service for free. Override `get_queryset` once the resource needs real logic
    (e.g. `ForecastRunService` calling out to ml_service, or filtering by the
    requesting user) — the point of this layer is to have somewhere to put that
    without touching the controller or view.
    """

    model = None
    select_related: tuple[str, ...] = ()

    def get_queryset(self):
        queryset = self.model.objects.all()
        if self.select_related:
            queryset = queryset.select_related(*self.select_related)
        return queryset
