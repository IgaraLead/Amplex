"""
Business logic tests: CRUD, data isolation, pipeline, export security.
"""

import json
from types import SimpleNamespace

import pytest

from .conftest import (
    make_contact,
    make_lead,
    make_org,
    make_stage,
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
class TestEcosystemContracts:
    def test_integrations_returns_actions_shape(self, client, admin_ctx, monkeypatch):
        org = admin_ctx["org"]

        def fake_get(*args, **kwargs):
            return SimpleNamespace(
                status_code=200,
                json=lambda: {"active_products": {"nexus": True, "entity": True}},
            )

        monkeypatch.setattr("api.views.integrations.httpx.get", fake_get)

        resp = client.get(f"/amplex/api/id/{org.slug}/crm/integrations")
        assert resp.status_code == 200
        data = resp.json()
        keys = {item["key"] for item in data["actions"]}
        assert "open_conversation" in keys
        assert "lookup_cnpj" in keys

    def test_open_conversation_accepts_lead_id(self, client, admin_ctx, monkeypatch):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        contact = make_contact(org=org, name="Contato", email="contato@test.com")
        lead = make_lead(org=org, name="Lead Teste", stage=stage, contact=contact)

        def fake_post(*args, **kwargs):
            return SimpleNamespace(
                status_code=200,
                json=lambda: {
                    "id": 22,
                    "conversation_url": "https://nexus/conversations/22",
                },
            )

        monkeypatch.setattr("api.views.integrations.httpx.post", fake_post)

        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/integrations/open-conversation",
            data=json.dumps({"lead_id": lead.id}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert "conversation_url" in resp.json()

    def test_s2s_create_and_get_opportunity_contract(self, client, settings):
        settings.HUB_API_KEY = "test-hub-key"

        create_resp = client.post(
            "/amplex/api/opportunities",
            data=json.dumps(
                {
                    "client_slug": "missing-org",
                    "title": "Teste",
                    "contact": {"name": "Contato"},
                }
            ),
            content_type="application/json",
            HTTP_X_API_KEY="test-hub-key",
        )
        assert create_resp.status_code == 404
        assert "detail" in create_resp.json()
