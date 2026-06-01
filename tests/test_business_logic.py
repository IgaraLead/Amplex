"""
Business logic tests: CRUD, data isolation, pipeline, export security.
"""

import json
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth.hashers import check_password
from django.utils import timezone

from api.models import (
    Activity,
    ActivityReminder,
    AmplexOrgMember,
    AmplexUser,
    Interaction,
    Lead,
    LostReason,
    Stage,
    WonReason,
)
from api.tokens import create_access_token

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
class TestFollowupReminders:
    def test_create_followup_with_multiple_reminder_offsets(self, client, admin_ctx):
        org = admin_ctx["org"]
        lead = make_lead(org=org, name="Follow-up Lead", stage=admin_ctx["stage"])
        followup_at = (timezone.now() + timedelta(hours=2)).replace(microsecond=0)

        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/leads/{lead.id}/interactions",
            data=json.dumps(
                {
                    "type": "phone",
                    "description": "Retornar com proposta",
                    "followup_at": followup_at.isoformat(),
                    "reminder_offsets": [60, 120],
                }
            ),
            content_type="application/json",
        )

        assert resp.status_code == 201
        scheduled = resp.json()["scheduled_activity"]
        assert scheduled["due_at"].startswith(followup_at.isoformat())
        assert scheduled["reminder_offsets"] == [60, 120]

        activity = Activity.objects.get(id=scheduled["id"])
        assert activity.due_at == followup_at
        assert activity.date_deadline == timezone.localtime(followup_at).date()
        assert list(
            activity.reminders.order_by("offset_minutes").values_list(
                "offset_minutes", flat=True
            )
        ) == [60, 120]

    def test_notifications_only_list_due_undismissed_reminders(self, client, admin_ctx):
        org = admin_ctx["org"]
        user = admin_ctx["user"]
        lead = make_lead(org=org, name="Reminder Filter", stage=admin_ctx["stage"])
        activity = Activity.objects.create(
            lead=lead,
            user=user,
            summary="Retornar cliente",
            date_deadline=timezone.localdate() + timedelta(days=1),
            due_at=timezone.now() + timedelta(days=1),
        )
        due_reminder = ActivityReminder.objects.create(
            activity=activity,
            remind_at=timezone.now() - timedelta(minutes=5),
            offset_minutes=60,
        )
        ActivityReminder.objects.create(
            activity=activity,
            remind_at=timezone.now() + timedelta(hours=1),
            offset_minutes=120,
        )

        resp = client.get(f"/amplex/api/id/{org.slug}/crm/notifications")

        assert resp.status_code == 200
        data = resp.json()
        assert data["badge_count"] == 1
        assert data["items"][0]["id"] == f"reminder-{due_reminder.id}"
        assert data["items"][0]["due_at"] == activity.due_at.isoformat()
        assert data["items"][0]["remind_at"] == due_reminder.remind_at.isoformat()
        assert data["items"][0]["offset_minutes"] == 60

    def test_dismiss_notification_only_dismisses_one_reminder(self, client, admin_ctx):
        org = admin_ctx["org"]
        user = admin_ctx["user"]
        lead = make_lead(org=org, name="Dismiss Reminder", stage=admin_ctx["stage"])
        activity = Activity.objects.create(
            lead=lead,
            user=user,
            summary="Retornar cliente",
            date_deadline=timezone.localdate(),
            due_at=timezone.now() + timedelta(hours=3),
        )
        first = ActivityReminder.objects.create(
            activity=activity,
            remind_at=timezone.now() - timedelta(minutes=10),
            offset_minutes=60,
        )
        second = ActivityReminder.objects.create(
            activity=activity,
            remind_at=timezone.now() - timedelta(minutes=5),
            offset_minutes=120,
        )

        resp = client.delete(
            f"/amplex/api/id/{org.slug}/crm/notifications/reminder-{first.id}"
        )

        assert resp.status_code == 200
        first.refresh_from_db()
        second.refresh_from_db()
        assert first.dismissed_at is not None
        assert second.dismissed_at is None
        assert Activity.objects.filter(id=activity.id).exists()

    def test_complete_notification_finishes_activity_and_reminders(
        self, client, admin_ctx
    ):
        org = admin_ctx["org"]
        user = admin_ctx["user"]
        lead = make_lead(org=org, name="Complete Reminder", stage=admin_ctx["stage"])
        activity = Activity.objects.create(
            lead=lead,
            user=user,
            summary="Retornar cliente",
            date_deadline=timezone.localdate(),
            due_at=timezone.now() + timedelta(hours=1),
        )
        reminder = ActivityReminder.objects.create(
            activity=activity,
            remind_at=timezone.now() - timedelta(minutes=5),
            offset_minutes=60,
        )
        ActivityReminder.objects.create(
            activity=activity,
            remind_at=timezone.now() - timedelta(minutes=10),
            offset_minutes=120,
        )

        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/notifications/reminder-{reminder.id}/done",
            data=json.dumps({}),
            content_type="application/json",
        )

        assert resp.status_code == 200
        assert not Activity.objects.filter(id=activity.id).exists()
        assert not ActivityReminder.objects.filter(activity_id=activity.id).exists()
        assert Interaction.objects.filter(lead=lead, author=user).exists()


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

    def test_fixed_won_lost_stages_are_listed_and_protected(self, client, admin_ctx):
        org = admin_ctx["org"]
        resp = client.get(f"/amplex/api/id/{org.slug}/crm/stages")
        assert resp.status_code == 200
        stages = resp.json()["items"]
        won = next(stage for stage in stages if stage["name"] == "Ganho")
        lost = next(stage for stage in stages if stage["name"] == "Perdido")

        assert won["is_won"] is True
        assert won["is_fixed"] is True
        assert lost["is_lost"] is True
        assert lost["is_fixed"] is True

        delete_resp = client.delete(f"/amplex/api/id/{org.slug}/crm/stages/{won['id']}")
        assert delete_resp.status_code == 409

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

    def test_reorder_stages_keeps_fixed_stages_at_end(self, client, admin_ctx):
        org = admin_ctx["org"]
        first = admin_ctx["stage"]
        second = Stage.objects.create(org=org, name="Second", sequence=20)
        client.get(f"/amplex/api/id/{org.slug}/crm/stages")

        resp = client.put(
            f"/amplex/api/id/{org.slug}/crm/stages/reorder",
            data=json.dumps({"stage_ids": [second.id, first.id]}),
            content_type="application/json",
        )

        assert resp.status_code == 200
        names = [stage["name"] for stage in resp.json()["items"]]
        assert names[:2] == ["Second", "New"]
        assert names[-2:] == ["Ganho", "Perdido"]

    def test_delete_stage_moves_leads_to_another_regular_stage(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        destination = Stage.objects.create(org=org, name="Destination", sequence=20)
        lead = make_lead(org=org, name="Stage Lead", stage=stage)

        resp = client.delete(f"/amplex/api/id/{org.slug}/crm/stages/{stage.id}")

        assert resp.status_code == 200
        assert resp.json()["moved_leads"] == 1
        lead.refresh_from_db()
        assert lead.stage_id == destination.id
        assert not Stage.objects.filter(id=stage.id).exists()

    def test_delete_stage_ignores_inactive_opportunities_for_blocking(
        self, client, admin_ctx
    ):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        lead = make_lead(org=org, name="Archived Opportunity", stage=stage)
        lead.active = False
        lead.save(update_fields=["active"])

        resp = client.delete(f"/amplex/api/id/{org.slug}/crm/stages/{stage.id}")

        assert resp.status_code == 200
        assert resp.json()["moved_leads"] == 0
        lead.refresh_from_db()
        assert lead.stage_id is None
        assert not Stage.objects.filter(id=stage.id).exists()

    def test_move_to_fixed_won_or_lost_stage_requires_reason(self, client, admin_ctx):
        org = admin_ctx["org"]
        lead = make_lead(org=org, name="Reasoned Opportunity", stage=admin_ctx["stage"])
        client.get(f"/amplex/api/id/{org.slug}/crm/stages")
        won_stage = Stage.objects.get(org=org, is_won=True)
        lost_stage = Stage.objects.get(org=org, is_lost=True)
        won_reason = WonReason.objects.create(org=org, name="Melhor proposta")
        lost_reason = LostReason.objects.create(org=org, name="Concorrente")

        missing_resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/leads/{lead.id}/move",
            data=json.dumps({"stage_id": won_stage.id}),
            content_type="application/json",
        )
        assert missing_resp.status_code == 400

        won_resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/leads/{lead.id}/move",
            data=json.dumps({"stage_id": won_stage.id, "won_reason_id": won_reason.id}),
            content_type="application/json",
        )
        assert won_resp.status_code == 200
        lead = Lead.objects.get(id=lead.id)
        assert lead.won_reason_id == won_reason.id
        assert lead.probability == 100

        lost_resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/leads/{lead.id}/move",
            data=json.dumps(
                {"stage_id": lost_stage.id, "lost_reason_id": lost_reason.id}
            ),
            content_type="application/json",
        )
        assert lost_resp.status_code == 200
        lead = Lead.objects.get(id=lead.id)
        assert lead.lost_reason_id == lost_reason.id
        assert lead.won_reason_id is None
        assert lead.active is True

    def test_move_to_fixed_stage_without_reason_when_no_reasons_exist(
        self, client, admin_ctx
    ):
        org = admin_ctx["org"]
        lead = make_lead(
            org=org, name="No Reason Opportunity", stage=admin_ctx["stage"]
        )
        client.get(f"/amplex/api/id/{org.slug}/crm/stages")
        won_stage = Stage.objects.get(org=org, is_won=True)

        resp = client.post(
            f"/amplex/api/id/{org.slug}/crm/leads/{lead.id}/move",
            data=json.dumps({"stage_id": won_stage.id}),
            content_type="application/json",
        )

        assert resp.status_code == 200
        lead = Lead.objects.get(id=lead.id)
        assert lead.won_reason_id is None
        assert lead.probability == 100


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

    def test_global_admin_create_user_requires_organization(self, client, db):
        super_admin = make_user(
            name="Super", email="super3@test.com", password="secret"
        )
        user_dict = mock_user_dict(super_admin, role="super_admin", is_super_admin=True)
        with patch("api.auth_utils.get_current_user", return_value=(user_dict, None)):
            resp = client.post(
                "/amplex/api/admin/users",
                data=json.dumps(
                    {
                        "name": "Sem Org",
                        "email": "sem-org@test.com",
                        "password": "123456",
                        "role": "agente",
                    }
                ),
                content_type="application/json",
            )
            assert resp.status_code == 400

    def test_global_admin_create_superadmin_still_links_organization(self, client, db):
        super_admin = make_user(
            name="Super", email="super4@test.com", password="secret"
        )
        org = make_org(name="Super Org", slug="super-org")
        user_dict = mock_user_dict(super_admin, role="super_admin", is_super_admin=True)
        with patch("api.auth_utils.get_current_user", return_value=(user_dict, None)):
            resp = client.post(
                "/amplex/api/admin/users",
                data=json.dumps(
                    {
                        "name": "Novo Super",
                        "email": "novo-super@test.com",
                        "password": "123456",
                        "role": "superadmin",
                        "org_id": org.id,
                    }
                ),
                content_type="application/json",
            )
            assert resp.status_code == 201

        created = AmplexUser.objects.get(email="novo-super@test.com")
        assert created.is_super_admin is True
        assert AmplexOrgMember.objects.filter(
            org=org, user=created, role="admin", active=True
        ).exists()

    def test_global_admin_create_user_with_multiple_organizations(self, client, db):
        super_admin = make_user(
            name="Super", email="super6@test.com", password="secret"
        )
        org_a = make_org(name="Org A", slug="multi-org-a")
        org_b = make_org(name="Org B", slug="multi-org-b")
        user_dict = mock_user_dict(super_admin, role="super_admin", is_super_admin=True)
        with patch("api.auth_utils.get_current_user", return_value=(user_dict, None)):
            resp = client.post(
                "/amplex/api/admin/users",
                data=json.dumps(
                    {
                        "name": "Multi Org",
                        "email": "multi-org@test.com",
                        "password": "123456",
                        "role": "agente",
                        "memberships": [
                            {"org_id": org_a.id, "role": "member"},
                            {"org_id": org_b.id, "role": "admin"},
                        ],
                    }
                ),
                content_type="application/json",
            )
            assert resp.status_code == 201

        created = AmplexUser.objects.get(email="multi-org@test.com")
        assert AmplexOrgMember.objects.filter(
            org=org_a, user=created, role="member", active=True
        ).exists()
        assert AmplexOrgMember.objects.filter(
            org=org_b, user=created, role="admin", active=True
        ).exists()

    def test_org_user_list_includes_data_counts(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        target = make_user(
            name="Data Owner", email="data-owner@test.com", password="secret"
        )
        make_member(org=org, user=target, role="member")
        lead = make_lead(org=org, name="Owned Lead", stage=stage, user=target)
        Interaction.objects.create(lead=lead, author=target, body="Histórico")
        Activity.objects.create(lead=lead, user=target, summary="Follow-up")

        resp = client.get(f"/amplex/api/id/{org.slug}/crm/users")

        assert resp.status_code == 200
        data = resp.json()
        item = next(row for row in data["items"] if row["id"] == target.id)
        assert data["users"] == data["items"]
        assert item["data_counts"] == {
            "leads": 1,
            "interactions": 1,
            "activities": 1,
            "total": 3,
        }

    def test_org_admin_updates_member_basic_fields_only(self, client, admin_ctx):
        org = admin_ctx["org"]
        target = make_user(
            name="Editable Member", email="editable-member@test.com", password="secret"
        )
        make_member(org=org, user=target, role="member")

        resp = client.put(
            f"/amplex/api/id/{org.slug}/org/members/{target.id}",
            data=json.dumps(
                {
                    "name": "Editable Updated",
                    "email": "editable-updated@test.com",
                    "role": "admin",
                    "is_super_admin": True,
                    "memberships": [],
                    "password": "not-applied",
                }
            ),
            content_type="application/json",
        )

        assert resp.status_code == 200
        target.refresh_from_db()
        member = AmplexOrgMember.objects.get(org=org, user=target)
        assert target.name == "Editable Updated"
        assert target.email == "editable-updated@test.com"
        assert target.login == "editable-updated@test.com"
        assert target.is_super_admin is False
        assert member.role == "admin"

    def test_regular_member_cannot_update_org_member(self, client, member_ctx):
        org = member_ctx["org"]
        target = make_user(
            name="Other Member", email="other-member@test.com", password="secret"
        )
        make_member(org=org, user=target, role="member")

        resp = client.put(
            f"/amplex/api/id/{org.slug}/org/members/{target.id}",
            data=json.dumps(
                {"name": "Blocked", "email": target.email, "role": "admin"}
            ),
            content_type="application/json",
        )

        assert resp.status_code == 403

    def test_org_admin_cannot_demote_last_admin(self, client, admin_ctx):
        org = admin_ctx["org"]
        admin = admin_ctx["user"]

        resp = client.put(
            f"/amplex/api/id/{org.slug}/org/members/{admin.id}",
            data=json.dumps({"role": "member"}),
            content_type="application/json",
        )

        assert resp.status_code == 409
        assert AmplexOrgMember.objects.get(org=org, user=admin).role == "admin"

    def test_delete_member_requires_data_action_when_user_has_data(
        self, client, admin_ctx
    ):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        target = make_user(
            name="Has Data", email="has-data@test.com", password="secret"
        )
        make_member(org=org, user=target, role="member")
        lead = make_lead(org=org, name="Has Data Lead", stage=stage, user=target)
        Interaction.objects.create(lead=lead, author=target, body="Histórico")
        Activity.objects.create(lead=lead, user=target, summary="Follow-up")

        resp = client.delete(
            f"/amplex/api/id/{org.slug}/org/members/{target.id}/remove",
            data=json.dumps({"data_action": "none"}),
            content_type="application/json",
        )

        assert resp.status_code == 409
        assert resp.json()["requires_data_action"] is True
        assert AmplexOrgMember.objects.filter(org=org, user=target).exists()

    def test_delete_member_migrates_data_and_deletes_orphan_user(
        self, client, admin_ctx
    ):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        source = make_user(name="Source", email="source@test.com", password="secret")
        target = make_user(name="Target", email="target@test.com", password="secret")
        make_member(org=org, user=source, role="member")
        make_member(org=org, user=target, role="member")
        lead = make_lead(org=org, name="Migrated Lead", stage=stage, user=source)
        interaction = Interaction.objects.create(
            lead=lead, author=source, body="Histórico"
        )
        activity = Activity.objects.create(lead=lead, user=source, summary="Follow-up")

        resp = client.delete(
            f"/amplex/api/id/{org.slug}/org/members/{source.id}/remove",
            data=json.dumps({"data_action": "migrate", "target_user_id": target.id}),
            content_type="application/json",
        )

        assert resp.status_code == 200
        assert resp.json()["user_deleted"] is True
        assert not AmplexOrgMember.objects.filter(org=org, user=source).exists()
        assert not AmplexUser.objects.filter(id=source.id).exists()
        lead.refresh_from_db()
        interaction.refresh_from_db()
        activity.refresh_from_db()
        assert lead.user_id == target.id
        assert interaction.author_id == target.id
        assert activity.user_id == target.id

    def test_delete_member_deletes_selected_user_data(self, client, admin_ctx):
        org = admin_ctx["org"]
        stage = admin_ctx["stage"]
        source = make_user(
            name="Delete Source", email="delete-source@test.com", password="secret"
        )
        make_member(org=org, user=source, role="member")
        source_lead = make_lead(org=org, name="Deleted Lead", stage=stage, user=source)
        other_lead = make_lead(
            org=org, name="Kept Lead", stage=stage, user=admin_ctx["user"]
        )
        Interaction.objects.create(lead=source_lead, author=source, body="Apaga")
        remaining_interaction = Interaction.objects.create(
            lead=other_lead, author=source, body="Apaga também"
        )
        remaining_activity = Activity.objects.create(
            lead=other_lead, user=source, summary="Apaga atividade"
        )

        resp = client.delete(
            f"/amplex/api/id/{org.slug}/org/members/{source.id}/remove",
            data=json.dumps({"data_action": "delete"}),
            content_type="application/json",
        )

        assert resp.status_code == 200
        assert resp.json()["user_deleted"] is True
        assert not Lead.objects.filter(id=source_lead.id).exists()
        assert Lead.objects.filter(id=other_lead.id).exists()
        assert not Interaction.objects.filter(id=remaining_interaction.id).exists()
        assert not Activity.objects.filter(id=remaining_activity.id).exists()
        assert not AmplexUser.objects.filter(id=source.id).exists()

    def test_super_admin_can_delete_member_from_any_org(self, client, db):
        org = make_org(name="Any Org", slug="any-org")
        admin = make_user(
            name="Admin Any", email="admin-any@test.com", password="secret"
        )
        target = make_user(
            name="Any Target", email="any-target@test.com", password="secret"
        )
        super_admin = make_user(
            name="Super Any", email="super-any@test.com", password="secret"
        )
        make_member(org=org, user=admin, role="admin")
        make_member(org=org, user=target, role="member")
        user_dict = mock_user_dict(super_admin, role="super_admin", is_super_admin=True)

        with patch("api.auth_utils.get_current_user", return_value=(user_dict, None)):
            resp = client.delete(
                f"/amplex/api/id/{org.slug}/org/members/{target.id}/remove",
                data=json.dumps({"data_action": "none"}),
                content_type="application/json",
            )

        assert resp.status_code == 200
        assert not AmplexOrgMember.objects.filter(org=org, user=target).exists()
        assert not AmplexUser.objects.filter(id=target.id).exists()

    def test_global_admin_update_user_syncs_organizations(self, client, db):
        super_admin = make_user(
            name="Super", email="super7@test.com", password="secret"
        )
        target = make_user(
            name="Editable", email="editable@test.com", password="secret"
        )
        org_a = make_org(name="Org Edit A", slug="edit-org-a")
        org_b = make_org(name="Org Edit B", slug="edit-org-b")
        org_c = make_org(name="Org Edit C", slug="edit-org-c")
        make_member(org=org_a, user=target, role="member")
        make_member(org=org_b, user=target, role="member")
        user_dict = mock_user_dict(super_admin, role="super_admin", is_super_admin=True)

        with patch("api.auth_utils.get_current_user", return_value=(user_dict, None)):
            resp = client.put(
                f"/amplex/api/admin/users/{target.id}",
                data=json.dumps(
                    {
                        "name": "Editable Updated",
                        "email": "editable@test.com",
                        "active": True,
                        "is_super_admin": False,
                        "memberships": [
                            {"org_id": org_b.id, "role": "admin"},
                            {"org_id": org_c.id, "role": "member"},
                        ],
                    }
                ),
                content_type="application/json",
            )
            assert resp.status_code == 200

        assert not AmplexOrgMember.objects.filter(org=org_a, user=target).exists()
        assert AmplexOrgMember.objects.get(org=org_b, user=target).role == "admin"
        assert AmplexOrgMember.objects.get(org=org_c, user=target).active is True

    def test_password_reset_invalidates_sessions_and_forces_change(self, client, db):
        super_admin = make_user(
            name="Super", email="super5@test.com", password="secret"
        )
        org = make_org(name="Reset Org", slug="reset-org")
        target = make_user(
            name="Reset User", email="reset@test.com", password="old-secret"
        )
        make_member(org=org, user=target, role="member")

        old_access = create_access_token(
            str(target.id), {"session_version": int(target.session_version or 0)}
        )
        target_client = client.__class__()
        target_client.cookies["amplex_access"] = old_access

        user_dict = mock_user_dict(super_admin, role="super_admin", is_super_admin=True)
        with patch("api.auth_utils.get_current_user", return_value=(user_dict, None)):
            reset_resp = client.post(
                f"/amplex/api/admin/users/{target.id}/reset-password",
                data=json.dumps({}),
                content_type="application/json",
            )
            assert reset_resp.status_code == 200
            temporary_password = reset_resp.json()["temporary_password"]

        assert target_client.get("/amplex/api/auth/me").status_code == 401

        login_resp = target_client.post(
            "/amplex/api/auth/login",
            data=json.dumps(
                {"email": "reset@test.com", "password": temporary_password}
            ),
            content_type="application/json",
        )
        assert login_resp.status_code == 200
        assert (
            target_client.get("/amplex/api/auth/me").json()["force_password_change"]
            is True
        )

        blocked_resp = target_client.get(f"/amplex/api/id/{org.slug}/crm/leads")
        assert blocked_resp.status_code == 403
        assert blocked_resp.json()["error"] == "password_change_required"

        change_resp = target_client.post(
            "/amplex/api/auth/change-password",
            data=json.dumps(
                {
                    "senha_atual": temporary_password,
                    "nova_senha": "new-secret-123",
                }
            ),
            content_type="application/json",
            headers={"x-csrf-token": target_client.cookies["amplex_csrf"].value},
        )
        assert change_resp.status_code == 200
        assert (
            target_client.get("/amplex/api/auth/me").json()["force_password_change"]
            is False
        )

        target.refresh_from_db()
        assert target.force_password_change is False
        assert target.session_version == 2
        assert check_password("new-secret-123", target.password_hash)
