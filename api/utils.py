"""Utility helpers for Amplex bootstrap data."""

from __future__ import annotations

import logging
import os

from django.contrib.auth.hashers import make_password
from django.db import transaction

from .models import AmplexOrganization, AmplexOrgMember, AmplexUser, Stage

logger = logging.getLogger(__name__)

DEFAULT_ADMIN_EMAIL = "admin@dev.local"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_ADMIN_NAME = "Admin"
DEFAULT_ORG_NAME = "Dev Org"
DEFAULT_ORG_SLUG = "dev"
DEFAULT_STAGES = [
    ("Novo", 1, False),
    ("Qualificação", 2, False),
    ("Proposta", 3, False),
    ("Negociação", 4, False),
    ("Ganho", 5, True),
]


def _ensure_default_stages(org: AmplexOrganization) -> None:
    if Stage.objects.filter(org=org).exists():
        return
    for stage_name, sequence, is_won in DEFAULT_STAGES:
        Stage.objects.create(org=org, name=stage_name, sequence=sequence, is_won=is_won)


def create_first_bootstrap_data() -> None:
    """Seed initial Amplex data when the database is empty."""
    with transaction.atomic():
        has_users = AmplexUser.objects.exists()
        has_orgs = AmplexOrganization.objects.exists()
        if has_users or has_orgs:
            return

        admin_email = os.getenv("AMPLEX_ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL).strip()
        admin_password = os.getenv(
            "AMPLEX_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD
        ).strip()
        admin_name = os.getenv("AMPLEX_ADMIN_NAME", DEFAULT_ADMIN_NAME).strip()
        org_name = os.getenv("AMPLEX_DEFAULT_ORG_NAME", DEFAULT_ORG_NAME).strip()
        org_slug = os.getenv("AMPLEX_DEFAULT_ORG_SLUG", DEFAULT_ORG_SLUG).strip()

        user = AmplexUser.objects.create(
            hub_id=None,
            name=admin_name or DEFAULT_ADMIN_NAME,
            email=admin_email or DEFAULT_ADMIN_EMAIL,
            login=admin_email or DEFAULT_ADMIN_EMAIL,
            password_hash=make_password(admin_password or DEFAULT_ADMIN_PASSWORD),
            is_platform_super_admin=True,
            active=True,
            is_internal=True,
        )
        org = AmplexOrganization.objects.create(
            hub_org_id=f"local-{org_slug or DEFAULT_ORG_SLUG}",
            name=org_name or DEFAULT_ORG_NAME,
            slug=org_slug or DEFAULT_ORG_SLUG,
            active=True,
        )
        AmplexOrgMember.objects.create(
            org=org,
            user=user,
            role="admin",
            active=True,
        )
        _ensure_default_stages(org)

    logger.info(
        "Amplex bootstrap seeded with admin %s and org %s",
        admin_email or DEFAULT_ADMIN_EMAIL,
        org_slug or DEFAULT_ORG_SLUG,
    )
