"""Lead CRUD views."""

import json

from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import AmplexUser, Contact, Interaction, Lead, LostReason, Stage, Tag
from api.realtime import broadcast_leads_updated

from .permissions import get_user_permission


def _clamp_float(value, min_val=0, max_val=1e12):
    """Safely convert to float and clamp to valid range."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(min_val, min(v, max_val))


def _check_lead_access(lead, user):
    if user["role"] == "admin":
        return True
    try:
        user_model = AmplexUser.objects.get(id=user["user_id"])
        if get_user_permission(user_model, "view_all_leads"):
            return True
    except AmplexUser.DoesNotExist:
        pass
    return lead.user_id == user["user_id"]


def _lead_list_item(lead):
    return {
        "id": lead.id,
        "name": lead.name,
        "type": lead.type,
        "stage_id": lead.stage_id,
        "stage_name": lead.stage.name if lead.stage else "",
        "contact_name": lead.contact_name or "",
        "partner_name": lead.contact.name if lead.contact else "",
        "email_from": lead.email_from or "",
        "phone": lead.phone or "",
        "expected_revenue": lead.expected_revenue or 0,
        "probability": lead.probability or 0,
        "priority": lead.priority or "0",
        "user_name": lead.user.name if lead.user else "",
        "source_id": lead.source_id,
        "source_name": lead.source.name if lead.source else "",
        "function": lead.function or "",
        "create_date": lead.created_at,
    }


@require_http_methods(["GET"])
@org_required
def list_leads(request, slug):
    user = request.amplex_user
    org = request.amplex_org
    page = int(request.GET.get("page", 1))
    limit = min(int(request.GET.get("limit", 20)), 100)
    search = request.GET.get("search")
    lead_type = request.GET.get("type")
    stage_id = request.GET.get("stage_id")

    qs = Lead.objects.filter(active=True, org=org).select_related(
        "stage", "contact", "user", "source"
    )

    if user["role"] != "admin":
        try:
            user_model = AmplexUser.objects.get(id=user["user_id"])
            if not get_user_permission(user_model, "view_all_leads"):
                qs = qs.filter(user_id=user["user_id"])
        except AmplexUser.DoesNotExist:
            qs = qs.filter(user_id=user["user_id"])

    if lead_type in ("lead", "opportunity"):
        qs = qs.filter(type=lead_type)
    if stage_id:
        qs = qs.filter(stage_id=int(stage_id))
    if search:
        qs = qs.filter(
            Q(name__icontains=search)
            | Q(contact_name__icontains=search)
            | Q(email_from__icontains=search)
        )

    total = qs.count()
    offset = (page - 1) * limit
    leads = list(qs.order_by("-created_at")[offset : offset + limit])

    return JsonResponse(
        {
            "items": [_lead_list_item(lead) for lead in leads],
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit if total else 0,
        }
    )


@require_http_methods(["POST"])
@org_required
def create_lead(request, slug):
    user = request.amplex_user
    org = request.amplex_org
    body = json.loads(request.body)

    name = (body.get("name") or "").strip()
    if not name:
        return JsonResponse({"detail": "name is required"}, status=400)

    lead = Lead(
        name=name,
        type=body.get("type", "opportunity"),
        org=org,
        contact_name=body.get("contact_name", ""),
        email_from=body.get("email_from", ""),
        phone=body.get("phone", ""),
        expected_revenue=_clamp_float(body.get("expected_revenue", 0), 0, 1e12),
        description=body.get("description", ""),
        priority=body.get("priority", "0"),
        function=body.get("function", ""),
        user_id=user["user_id"],
    )

    if body.get("source_id"):
        lead.source_id = body["source_id"]
    if body.get("stage_id"):
        lead.stage_id = body["stage_id"]
    else:
        first_stage = Stage.objects.filter(org=org).order_by("sequence").first()
        if first_stage:
            lead.stage = first_stage

    partner_id = body.get("partner_id")
    if partner_id:
        lead.contact_id = partner_id
    elif body.get("email_from") or body.get("phone"):
        contact = None
        if body.get("email_from"):
            contact = Contact.objects.filter(email=body["email_from"], org=org).first()
        if not contact and body.get("phone"):
            contact = Contact.objects.filter(phone=body["phone"], org=org).first()
        if contact:
            lead.contact = contact

    lead.save()
    broadcast_leads_updated(org.slug, lead_id=lead.id)
    return JsonResponse(
        {
            "id": lead.id,
            "name": lead.name,
            "stage_id": lead.stage_id,
            "stage_name": lead.stage.name if lead.stage else "",
        },
        status=201,
    )


@require_http_methods(["GET"])
@org_required
def get_lead(request, slug, lead_id):
    user = request.amplex_user
    org = request.amplex_org

    lead = (
        Lead.objects.filter(id=lead_id, org=org)
        .select_related("stage", "contact", "user", "source", "lost_reason")
        .first()
    )
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _check_lead_access(lead, user):
        return JsonResponse({"detail": "Not found"}, status=404)

    tags = [{"id": t.id, "name": t.name, "color": t.color} for t in lead.tags.all()]

    return JsonResponse(
        {
            "id": lead.id,
            "name": lead.name,
            "type": lead.type,
            "stage_id": lead.stage_id,
            "stage_name": lead.stage.name if lead.stage else "",
            "contact_name": lead.contact_name or "",
            "partner_id": lead.contact_id,
            "partner_name": lead.contact.name if lead.contact else "",
            "email_from": lead.email_from or "",
            "phone": lead.phone or "",
            "mobile": lead.mobile or "",
            "expected_revenue": lead.expected_revenue or 0,
            "probability": lead.probability or 0,
            "priority": lead.priority or "0",
            "description": lead.description or "",
            "street": lead.street or "",
            "city": lead.city or "",
            "state_id": None,
            "state_name": lead.state_name or "",
            "country_id": None,
            "country_name": lead.country_name or "",
            "user_id": lead.user_id,
            "user_name": lead.user.name if lead.user else "",
            "team_id": None,
            "team_name": "",
            "source_id": lead.source_id,
            "source_name": lead.source.name if lead.source else "",
            "function": lead.function or "",
            "tag_ids": tags,
            "create_date": lead.created_at,
            "write_date": lead.updated_at,
            "date_deadline": lead.date_deadline,
            "date_closed": lead.date_closed,
            "lost_reason_id": lead.lost_reason_id,
            "lost_reason": lead.lost_reason.name if lead.lost_reason else "",
        }
    )


@require_http_methods(["PUT"])
@org_required
def update_lead(request, slug, lead_id):
    user = request.amplex_user
    org = request.amplex_org
    body = json.loads(request.body)

    lead = Lead.objects.filter(id=lead_id, org=org).select_related("stage").first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _check_lead_access(lead, user):
        return JsonResponse({"detail": "Not found"}, status=404)

    writable = [
        "name",
        "type",
        "contact_name",
        "email_from",
        "phone",
        "expected_revenue",
        "probability",
        "priority",
        "description",
        "street",
        "city",
        "date_deadline",
        "function",
    ]
    for field in writable:
        if field in body:
            if field == "expected_revenue":
                setattr(lead, field, _clamp_float(body[field], 0, 1e12))
            elif field == "probability":
                setattr(lead, field, _clamp_float(body[field], 0, 100))
            else:
                setattr(lead, field, body[field])

    if "stage_id" in body:
        lead.stage_id = body["stage_id"]
    if "partner_id" in body:
        lead.contact_id = body["partner_id"]
    if "user_id" in body:
        lead.user_id = body["user_id"]
    if "source_id" in body:
        lead.source_id = body["source_id"]

    lead.save()

    if "tag_ids" in body:
        tag_objs = Tag.objects.filter(id__in=body["tag_ids"], org=org)
        lead.tags.set(tag_objs)

    broadcast_leads_updated(org.slug, lead_id=lead.id)
    return JsonResponse(
        {
            "id": lead.id,
            "name": lead.name,
            "stage_name": lead.stage.name if lead.stage else "",
        }
    )


@require_http_methods(["DELETE"])
@org_required
def delete_lead(request, slug, lead_id):
    user = request.amplex_user
    org = request.amplex_org

    lead = Lead.objects.filter(id=lead_id, org=org).first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _check_lead_access(lead, user):
        return JsonResponse({"detail": "Not found"}, status=404)

    lead.active = False
    lead.save(update_fields=["active"])
    broadcast_leads_updated(org.slug, lead_id=lead.id)
    return JsonResponse({"id": lead.id, "archived": True})


@require_http_methods(["POST"])
@org_required
def move_lead(request, slug, lead_id):
    user = request.amplex_user
    org = request.amplex_org
    body = json.loads(request.body)

    lead = Lead.objects.filter(id=lead_id, org=org).first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _check_lead_access(lead, user):
        return JsonResponse({"detail": "Not found"}, status=404)

    stage = Stage.objects.filter(id=body.get("stage_id"), org=org).first()
    if not stage:
        return JsonResponse({"detail": "Stage not found"}, status=404)

    lead.stage = stage
    lead.save(update_fields=["stage_id"])
    broadcast_leads_updated(org.slug, lead_id=lead.id)
    return JsonResponse(
        {
            "id": lead.id,
            "name": lead.name,
            "stage_id": stage.id,
            "stage_name": stage.name,
        }
    )


@require_http_methods(["POST"])
@org_admin_required
def transfer_lead(request, slug, lead_id):
    user = request.amplex_user
    org = request.amplex_org
    body = json.loads(request.body)

    lead = Lead.objects.filter(id=lead_id, org=org).select_related("user").first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)

    new_user = (
        AmplexUser.objects.filter(id=body.get("user_id"))
        .filter(memberships__org=org)
        .first()
    )
    if not new_user:
        return JsonResponse({"detail": "User not found"}, status=404)

    old_user_name = lead.user.name if lead.user else "Ninguém"
    lead.user = new_user
    lead.save(update_fields=["user_id"])

    Interaction.objects.create(
        lead=lead,
        interaction_type="note",
        body=(
            f"<p>🔄 <strong>Lead transferido</strong> de "
            f"{old_user_name} para {new_user.name}</p>"
        ),
        preview=f"Lead transferido de {old_user_name} para {new_user.name}",
        author_id=user["user_id"],
    )

    broadcast_leads_updated(org.slug, lead_id=lead.id)
    return JsonResponse(
        {"id": lead.id, "user_id": new_user.id, "user_name": new_user.name}
    )


@require_http_methods(["POST"])
@org_required
def mark_lead_lost(request, slug, lead_id):
    user = request.amplex_user
    org = request.amplex_org
    body = json.loads(request.body)

    lead = Lead.objects.filter(id=lead_id, org=org).first()
    if not lead:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _check_lead_access(lead, user):
        return JsonResponse({"detail": "Not found"}, status=404)

    reason = LostReason.objects.filter(id=body.get("lost_reason_id"), org=org).first()
    if not reason:
        return JsonResponse({"detail": "Lost reason not found"}, status=404)

    lead.active = False
    lead.lost_reason = reason
    lead.probability = 0
    lead.save(update_fields=["active", "lost_reason_id", "probability"])

    Interaction.objects.create(
        lead=lead,
        interaction_type="note",
        body=f"<p>❌ <strong>Oportunidade perdida</strong>: {reason.name}</p>",
        preview=f"Oportunidade perdida: {reason.name}",
        author_id=user["user_id"],
    )

    broadcast_leads_updated(org.slug, lead_id=lead.id)
    return JsonResponse({"id": lead.id, "lost": True, "reason": reason.name})
