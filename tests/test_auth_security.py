"""
Security test suite for Amplex — Authentication, Authorization & OWASP Top 10.

Covers:
- Authentication (JWT validation, unauthenticated access)
- Authorization (tenant isolation, role-based access)
- CSRF protection
- Security headers
- Input validation & injection prevention
- S2S API key validation
- Request body limits
- XSS prevention
"""

import json

import pytest

pytestmark = pytest.mark.django_db


# ── Security Headers ─────────────────────────────────────


class TestSecurityHeaders:
    def test_nosniff_header(self, client):
        resp = client.get("/amplex/api/health")
        assert resp["X-Content-Type-Options"] == "nosniff"

    def test_xframe_deny(self, client):
        resp = client.get("/amplex/api/health")
        assert resp["X-Frame-Options"] == "DENY"

    def test_referrer_policy(self, client):
        resp = client.get("/amplex/api/health")
        assert resp["Referrer-Policy"] == "strict-origin-when-cross-origin"

    def test_permissions_policy(self, client):
        resp = client.get("/amplex/api/health")
        assert "camera=()" in resp["Permissions-Policy"]

    def test_json_content_type(self, client):
        resp = client.get("/amplex/api/health")
        assert "application/json" in resp["Content-Type"]


# ── Health Endpoint ──────────────────────────────────────


class TestHealth:
    def test_health_endpoint(self, client):
        resp = client.get("/amplex/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("ok", "healthy")
        assert data["product"] == "amplex"

    def test_health_no_auth_required(self, client):
        resp = client.get("/amplex/api/health")
        assert resp.status_code in (200, 503)


# ── Authentication ───────────────────────────────────────


class TestUnauthenticatedAccess:
    """All CRM endpoints must require authentication."""

    def test_leads_require_auth(self, client):
        resp = client.get("/amplex/api/id/test-org/crm/leads")
        assert resp.status_code in (401, 403)

    def test_contacts_require_auth(self, client):
        resp = client.get("/amplex/api/id/test-org/crm/contacts")
        assert resp.status_code in (401, 403)

    def test_pipeline_requires_auth(self, client):
        resp = client.get("/amplex/api/id/test-org/crm/pipeline")
        assert resp.status_code in (401, 403)

    def test_dashboard_requires_auth(self, client):
        resp = client.get("/amplex/api/id/test-org/crm/dashboard")
        assert resp.status_code in (401, 403)

    def test_export_requires_auth(self, client):
        resp = client.get("/amplex/api/id/test-org/crm/export/leads")
        assert resp.status_code in (401, 403)

    def test_stages_require_auth(self, client):
        resp = client.get("/amplex/api/id/test-org/crm/stages")
        assert resp.status_code in (401, 403)

    def test_tags_require_auth(self, client):
        resp = client.get("/amplex/api/id/test-org/crm/tags")
        assert resp.status_code in (401, 403)

    def test_invalid_token_rejected(self, client):
        resp = client.get(
            "/amplex/api/id/test-org/crm/leads",
            HTTP_AUTHORIZATION="Bearer invalid.token.here",
        )
        assert resp.status_code in (401, 403)

    def test_tampered_token_rejected(self, client):
        resp = client.get(
            "/amplex/api/id/test-org/crm/leads",
            HTTP_AUTHORIZATION="Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.tampered.sig",
        )
        assert resp.status_code in (401, 403)


# ── CSRF Protection ──────────────────────────────────────


class TestCSRFProtection:
    """CSRF middleware tests for cookie-based auth."""

    def test_get_bypasses_csrf(self, client, admin_ctx):
        org = admin_ctx["org"]
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/leads")
        assert resp.status_code != 403

    def test_post_without_csrf_with_cookie_auth_blocked(self, client):
        client.cookies["amplex_access"] = "some-token"
        resp = client.post(
            "/amplex/api/id/test-org/crm/leads",
            data=json.dumps({"name": "Test"}),
            content_type="application/json",
            headers={"x-csrf-token": ""},
        )
        assert resp.status_code == 403

    def test_post_wrong_csrf_blocked(self, client):
        client.cookies["amplex_access"] = "some-token"
        client.cookies["amplex_csrf"] = "real-csrf"
        resp = client.post(
            "/amplex/api/id/test-org/crm/leads",
            data=json.dumps({"name": "Test"}),
            content_type="application/json",
            headers={"x-csrf-token": "wrong-csrf"},
        )
        assert resp.status_code == 403


# ── Input Validation & Injection Prevention ──────────────


class TestInjectionPrevention:
    """SQL injection, XSS, and path traversal prevention."""

    def test_sql_injection_in_lead_name(self, client, admin_ctx):
        org = admin_ctx["org"]
        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/leads",
            data=json.dumps({"name": "'; DROP TABLE amplex_leads; --"}),
            content_type="application/json",
        )
        # Should either create safely or reject — never execute SQL
        assert resp.status_code in (200, 201, 400, 422)

    def test_xss_in_lead_name(self, client, admin_ctx):
        org = admin_ctx["org"]
        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/leads",
            data=json.dumps({"name": "<script>alert('xss')</script>"}),
            content_type="application/json",
        )
        if resp.status_code in (200, 201):
            assert "application/json" in resp["Content-Type"]

    def test_path_traversal(self, client):
        resp = client.get("/../../etc/passwd")
        assert resp.status_code in (200, 404)
        if resp.status_code == 200:
            assert "root:" not in resp.content.decode()

    def test_null_byte_injection(self, client):
        resp = client.get("/amplex/api/health%00.html")
        assert resp.status_code in (200, 400, 404)


# ── Request Body Limits ──────────────────────────────────


class TestRequestBodyLimits:
    def test_oversized_body_rejected(self, client):
        large_payload = {"data": "x" * (6 * 1024 * 1024)}
        resp = client.post(
            "/amplex/api/id/test-org/crm/leads",
            data=json.dumps(large_payload),
            content_type="application/json",
        )
        assert resp.status_code == 413


# ── Tenant Isolation ─────────────────────────────────────


class TestTenantIsolation:
    """Cross-org data access prevention."""

    def test_data_isolated_between_orgs(self, client, admin_ctx, db):
        """Leads from one org must not be visible in another."""
        from unittest.mock import patch

        from tests.conftest import (
            make_lead,
            make_member,
            make_org,
            make_stage,
            make_user,
            mock_user_dict,
        )

        org_a = admin_ctx["org"]
        stage_a = admin_ctx["stage"]

        org_b = make_org(name="OrgB", slug="org-b")
        user_b = make_user(name="UserB", email="b@test.com")
        make_member(org=org_b, user=user_b, role="admin")
        make_stage(org=org_b, name="New", sequence=1)

        # Create lead in org A
        make_lead(org=org_a, name="Secret Lead", stage=stage_a)

        # Access as org B user
        user_dict_b = mock_user_dict(user_b, role="admin", org=org_b)
        with patch("api.auth_utils.get_current_user", return_value=(user_dict_b, None)):
            resp = client.get(f"/amplex/api/id/{org_b.slug}/crm/leads")
            if resp.status_code == 200:
                data = resp.json()
                leads = data if isinstance(data, list) else data.get("results", [])
                names = [lead.get("name") for lead in leads]
                assert "Secret Lead" not in names
