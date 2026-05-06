"""Seed admin user and optional default organization from environment."""

import os

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand

from api.models import AmplexOrganization, AmplexOrgMember, AmplexUser, Stage

DEFAULT_STAGES = [
    ("Novo", 1, False),
    ("Qualificação", 2, False),
    ("Proposta", 3, False),
    ("Negociação", 4, False),
    ("Ganho", 5, True),
]


class Command(BaseCommand):
    help = "Creates AMPLEX_ADMIN_EMAIL user and optional default organization."

    def handle(self, *args, **options):
        email = (os.getenv("AMPLEX_ADMIN_EMAIL") or "").strip().lower()
        password = os.getenv("AMPLEX_ADMIN_PASSWORD") or ""
        name = (os.getenv("AMPLEX_ADMIN_NAME") or "Admin").strip() or "Admin"
        org_name = (os.getenv("AMPLEX_DEFAULT_ORG_NAME") or "").strip()
        org_slug = (os.getenv("AMPLEX_DEFAULT_ORG_SLUG") or "").strip().lower()

        if not email or not password:
            self.stdout.write(
                self.style.WARNING(
                    "amplex_bootstrap skipped — set AMPLEX_ADMIN_EMAIL and "
                    "AMPLEX_ADMIN_PASSWORD"
                )
            )
            return

        user, created = AmplexUser.objects.get_or_create(
            email=email,
            defaults={
                "name": name,
                "login": email,
                "password_hash": make_password(password),
            },
        )
        if not created:
            user.name = name
            user.password_hash = make_password(password)
            user.save(update_fields=["name", "password_hash"])

        self.stdout.write(self.style.SUCCESS(f"User OK: {email}"))

        if not org_name or not org_slug:
            self.stdout.write("No default org (AMPLEX_DEFAULT_ORG_* unset)")
            return

        org, org_created = AmplexOrganization.objects.get_or_create(
            slug=org_slug,
            defaults={"name": org_name},
        )
        if not org_created and org.name != org_name:
            org.name = org_name
            org.save(update_fields=["name"])

        AmplexOrgMember.objects.get_or_create(
            org=org, user=user, defaults={"role": "admin"}
        )

        if org_created:
            for stage_name, seq, is_won in DEFAULT_STAGES:
                Stage.objects.create(
                    org=org, name=stage_name, sequence=seq, is_won=is_won
                )

        self.stdout.write(self.style.SUCCESS(f"Organization OK: {org_slug}"))
