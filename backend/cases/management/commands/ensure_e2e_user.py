"""Create/reset the fixed user the checked-in Playwright e2e suite signs in
as (frontend/e2e/) — idempotent so CI or a local run can call it every time
without caring whether the user already exists.

Deliberately NOT a fixture/migration: this is dev/test tooling only, never
run against a real deployment (there isn't one yet — see docs/roadmap.md).
Credentials are a fixed, publicly-known default suitable for a local dev
database, overridable via env vars for anyone who wants different ones.

Usage:
    python manage.py ensure_e2e_user
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

DEFAULT_USERNAME = "e2e_test"
DEFAULT_PASSWORD = "e2e-test-only-pass"  # nosec: dev/test-only fixture user, not a real credential


class Command(BaseCommand):
    help = "Create or reset the fixed e2e-test user the Playwright suite signs in as."

    def handle(self, *args, **options):
        username = os.environ.get("E2E_USERNAME", DEFAULT_USERNAME)
        password = os.environ.get("E2E_PASSWORD", DEFAULT_PASSWORD)

        User = get_user_model()
        user, created = User.objects.get_or_create(username=username)
        user.set_password(password)
        user.is_active = True
        user.save()

        verb = "Created" if created else "Reset"
        self.stdout.write(self.style.SUCCESS(f"{verb} e2e user {username!r}."))
