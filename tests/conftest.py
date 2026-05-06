"""
Shared test fixtures for Amplex (Django).
Provides Django test client, mock auth, and factory helpers.
"""

import uuid
from unittest.mock import patch

import pytest
from django.contrib.auth.hashers import make_password
from django.test import Client

from api.models import (
    AmplexOrganization,
    AmplexOrgMember,
    AmplexUser,
    Contact,
    Lead,
    Stage,
)


def make_org(*, name="TestOrg", slug=None):
    return AmplexOrganization.objects.create(
        name=name,
        slug=slug or f"test-{uuid.uuid4().hex[:8]}",
    )


def make_user(*, password: str, name="TestUser", email="user@test.com"):
    login = email
    return AmplexUser.objects.create(
        name=name,
        email=email,
        login=login,
        password_hash=make_password(password),
    )


def make_member(*, org, user, role="member"):
    return AmplexOrgMember.objects.create(org=org, user=user, role=role)


def make_stage(*, org, name="New", sequence=10, is_won=False):
    return Stage.objects.create(org=org, name=name, sequence=sequence, is_won=is_won)


def make_contact(*, org, name="Test Contact", email="c@test.com"):
    return Contact.objects.create(org=org, name=name, email=email)


def make_lead(*, org, name="Test Lead", stage=None, user=None, contact=None):
    return Lead.objects.create(
        org=org,
        name=name,
        stage=stage,
        user=user,
        contact=contact,
    )


def mock_user_dict(user, role="admin", org=None, is_super_admin=False):
    """Build the dict that get_current_user returns."""
    return {
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "role": role,
        "is_super_admin": is_super_admin,
        "memberships": [],
    }


@pytest.fixture
def client():
    return Client()


@pytest.fixture
def db(transactional_db):
    """Alias for transactional_db to keep tests readable."""
    return transactional_db


@pytest.fixture
def admin_ctx(db):
    """Create an org, admin user, stage, and patch auth."""
    org = make_org(name="AdminOrg")
    user = make_user(name="Admin", email="admin@test.com", password="secret")
    make_member(org=org, user=user, role="admin")
    stage = make_stage(org=org, name="New", sequence=1)

    user_dict = mock_user_dict(user, role="admin", org=org)

    patcher = patch("api.auth_utils.get_current_user", return_value=(user_dict, None))
    patcher.start()

    yield {"org": org, "user": user, "stage": stage}

    patcher.stop()


@pytest.fixture
def member_ctx(db):
    """Create an org, regular member, stage, and patch auth."""
    org = make_org(name="MemberOrg")
    user = make_user(name="Member", email="member@test.com", password="secret")
    make_member(org=org, user=user, role="member")
    stage = make_stage(org=org, name="New", sequence=1)

    user_dict = mock_user_dict(user, role="member", org=org)

    patcher = patch("api.auth_utils.get_current_user", return_value=(user_dict, None))
    patcher.start()

    yield {"org": org, "user": user, "stage": stage}

    patcher.stop()
