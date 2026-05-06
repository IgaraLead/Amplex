"""
Business logic tests: CRUD, data isolation, pipeline, export security.
"""

import json
from unittest.mock import patch

import pytest

from .conftest import (
    make_contact,
    make_lead,
    make_member,
    make_org,
    make_stage,
    make_user,
    mock_user_dict,
)


@pytest.mark.django_db
class TestLeadCRUD:
    def test_create_lead(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/leads",
            data=json.dumps({"name": "New Lead", "stage_id": stage.id}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Lead"

    def test_list_leads(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        make_lead(org=org, name="Lead A", stage=stage)
        make_lead(org=org, name="Lead B", stage=stage)
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/leads")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) >= 2

    def test_get_lead_detail(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        lead = make_lead(org=org, name="Detail", stage=stage)
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/leads/{lead.id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Detail"

    def test_update_lead(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        lead = make_lead(org=org, name="Old Name", stage=stage)
        resp = client.put(
            f"/amplex/api/id/{org.slug}/crm/leads/{lead.id}",
            data=json.dumps({"name": "New Name"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_delete_lead(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        lead = make_lead(org=org, name="Delete Me", stage=stage)
        resp = client.delete(f"/amplex/api/id/{org.slug}/crm/leads/{lead.id}")
        assert resp.status_code == 200


@pytest.mark.django_db
class TestContactCRUD:
    def test_create_contact(self, client, admin_ctx):
        org = admin_ctx["org"]
        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/contacts",
            data=json.dumps({"name": "New Contact", "email": "new@test.com"}),
            content_type="application/json",
        )
        assert resp.status_code == 201

    def test_list_contacts(self, client, admin_ctx):
        org = admin_ctx["org"]
        make_contact(org=org, name="C1", email="c1@test.com")
        make_contact(org=org, name="C2", email="c2@test.com")
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/contacts")
        assert resp.status_code == 200

    def test_get_contact_detail(self, client, admin_ctx):
        org = admin_ctx["org"]
        contact = make_contact(org=org, name="Detail Contact", email="dc@test.com")
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/contacts/{contact.id}")
        assert resp.status_code == 200


@pytest.mark.django_db
class TestDataIsolation:
    def test_lead_from_other_org_not_accessible(self, client, admin_ctx):
        org_a = admin_ctx["org"]
        org_b = make_org(name="OrgB")
        stage_b = make_stage(org=org_b, name="StageB")
        lead_b = make_lead(org=org_b, name="OrgB Lead", stage=stage_b)

        resp = client.get(f"/amplex/api/id/{org_a.slug}/crm/leads/{lead_b.id}")
        assert resp.status_code in (403, 404)

    def test_contact_from_other_org_not_accessible(self, client, admin_ctx):
        org_a = admin_ctx["org"]
        org_b = make_org(name="OrgB2")
        contact_b = make_contact(org=org_b, name="OrgB Contact", email="cb@test.com")

        resp = client.get(f"/amplex/api/id/{org_a.slug}/crm/contacts/{contact_b.id}")
        assert resp.status_code in (403, 404)

    def test_listing_leads_only_shows_own_org(self, client, admin_ctx):
        org_a = admin_ctx["org"]
        stage_a = admin_ctx["stage"]
        org_b = make_org(name="OrgB3")
        stage_b = make_stage(org=org_b, name="StageB3")
        make_lead(org=org_a, name="My Lead", stage=stage_a)
        make_lead(org=org_b, name="Their Lead", stage=stage_b)

        resp = client.get(f"/amplex/api/id/{org_a.slug}/crm/leads")
        assert resp.status_code == 200
        items = resp.json()["items"]
        titles = [item["name"] for item in items]
        assert "My Lead" in titles
        assert "Their Lead" not in titles


@pytest.mark.django_db
class TestStageManagement:
    def test_list_stages(self, client, admin_ctx):
        org = admin_ctx["org"]
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/stages")
        assert resp.status_code == 200

    def test_create_stage_admin_only(self, client, member_ctx):
        org = member_ctx["org"]
        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/stages",
            data=json.dumps({"name": "New Stage"}),
            content_type="application/json",
        )
        assert resp.status_code in (403, 401)

    def test_create_stage_as_admin(self, client, admin_ctx):
        org = admin_ctx["org"]
        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/stages",
            data=json.dumps({"name": "Negotiation"}),
            content_type="application/json",
        )
        assert resp.status_code in (200, 201)


@pytest.mark.django_db
class TestPipeline:
    def test_pipeline_returns_stages_with_leads(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        make_lead(org=org, name="Kanban Lead", stage=stage)
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/pipeline")
        assert resp.status_code == 200


@pytest.mark.django_db
class TestExportSecurity:
    def test_csv_injection_in_lead_name(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        make_lead(org=org, name="=CMD('calc')", stage=stage)
        make_lead(org=org, name="+1+1*cmd", stage=stage)
        make_lead(org=org, name="-formula()", stage=stage)
        make_lead(org=org, name="@SUM(A1:A10)", stage=stage)
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/export/leads?format=csv")
        if resp.status_code == 200:
            content = resp.content.decode()
            assert "=CMD" not in content or "'=CMD" in content


@pytest.mark.django_db
class TestIntegrationsStandalone:
    def test_integrations_lists_no_external_actions(self, client, admin_ctx):
        org = admin_ctx["org"]
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/integrations")
        assert resp.status_code == 200
        assert resp.json().get("actions") == []

    def test_open_conversation_not_available(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        contact = make_contact(org=org, name="Contato", email="contato@test.com")
        lead = make_lead(org=org, name="Lead Teste", stage=stage, contact=contact)

        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/integrations/open-conversation",
            data=json.dumps({"lead_id": lead.id}),
            content_type="application/json",
        )
        assert resp.status_code == 503


@pytest.mark.django_db
class TestGlobalAdminAndSeats:
    def test_org_admin_cannot_access_global_admin_endpoints(self, client, admin_ctx):
        resp = client.get("/amplex/api/admin/orgs")
        assert resp.status_code == 403

    def test_super_admin_can_access_global_admin_endpoints(self, client, db):
        user = make_user(name="Super", email="super@test.com", password="secret")
        user_dict = mock_user_dict(user, role="super_admin", is_super_admin=True)
        with patch("api.auth_utils.get_current_user", return_value=(user_dict, None)):
            resp = client.get("/amplex/api/admin/orgs")
            assert resp.status_code == 200
            assert "items" in resp.json()

    def test_add_member_blocked_when_seat_limit_reached(self, client, admin_ctx):
        org = admin_ctx["org"]
        org.seat_limit = 1
        org.save(update_fields=["seat_limit"])
        user2 = make_user(name="U2", email="u2@test.com", password="secret")

        resp = client.post(
            f"/amplex/api/id/{org.slug}/org/members/add",
            data=json.dumps({"user_id": user2.id, "role": "member"}),
            content_type="application/json",
        )
        assert resp.status_code == 409
        assert "Limite de assentos" in resp.json().get("detail", "")

    def test_create_user_blocked_when_seat_limit_reached(self, client, admin_ctx):
        org = admin_ctx["org"]
        org.seat_limit = 1
        org.save(update_fields=["seat_limit"])

        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/users",
            data=json.dumps(
                {
                    "name": "Bloqueado",
                    "email": "bloqueado@test.com",
                    "password": "123456",
                    "role": "member",
                }
            ),
            content_type="application/json",
        )
        assert resp.status_code == 409

    def test_super_admin_add_member_respects_seat_limit(self, client, db):
        super_admin = make_user(
            name="Super", email="super2@test.com", password="secret"
        )
        org = make_org(name="OrgSeat", slug="org-seat")
        org.seat_limit = 1
        org.save(update_fields=["seat_limit"])
        user_a = make_user(name="A", email="a@test.com", password="secret")
        make_member(org=org, user=user_a, role="member")
        user_b = make_user(name="B", email="b2@test.com", password="secret")

        user_dict = mock_user_dict(super_admin, role="super_admin", is_super_admin=True)
        with patch("api.auth_utils.get_current_user", return_value=(user_dict, None)):
            resp = client.post(
                f"/amplex/api/admin/orgs/{org.id}/members",
                data=json.dumps({"user_id": user_b.id, "role": "member"}),
                content_type="application/json",
            )
            assert resp.status_code == 409
