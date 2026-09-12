"""Token auth endpoints. Deliberately minimal: no self-registration (this is
an internal decision-support tool for facility/county staff, not a public
app — accounts are created via `manage.py createsuperuser` or /admin/), just
login (obtain a token) and "who am I" (so the frontend has something to
display without decoding the token itself).
"""
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class LoginView(ObtainAuthToken):
    """POST {username, password} -> {token, username}. Wraps DRF's
    ObtainAuthToken to also return the username — the frontend needs
    something human-readable to show, not just an opaque token."""

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "username": user.username})


class MeView(APIView):
    """GET, with an Authorization header -> {username}. Lets the frontend
    validate a token it already has (e.g. one restored from localStorage) and
    get a display name back without hand-decoding anything."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"username": request.user.username})
