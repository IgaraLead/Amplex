"""Service-to-service views — protected by X-Api-Key."""

import json
import logging
from datetime import timedelta

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.auth_utils import require_api_key
from api.models import (
    AmplexOrganization,
    AmplexOrgMember,
    Contact,
    Lead,
    SharedOrganization,
    SharedSubscription,
    Stage,
)

logger = logging.getLogger(__name__)


@require_http_methods(["GET"])
@require_api_key
def metrics(request):
    slug = request.GET.get("client_slug", "")
    if not slug:
        return JsonResponse({"detail": "client_slug required"}, status=400)

    org = AmplexOrganization.objects.filter(slug=slug).first()
    if not org:
        return JsonResponse({"detail": "Organization not found"}, status=404)

    now = timezone.now()
    thirty_days_ago = now - timedelta(days=30)

    leads = Lead.objects.filter(org=org, active=True)
    total_leads = leads.count()
    total_opportunities = leads.filter(type="opportunity").count()

    # Won = leads in a stage marked is_won=True
    won_stage_ids = Stage.objects.filter(org=org, is_won=True).values_list(
        "id", flat=True
    )
    won = leads.filter(stage_id__in=won_stage_ids).count()

    # Lost = inactive leads (not in a won stage)
    lost = (
        Lead.objects.filter(org=org, active=False)
        .exclude(stage_id__in=won_stage_ids)
        .count()
    )

    # Revenue = sum of expected_revenue for won leads
    revenue = leads.filter(stage_id__in=won_stage_ids).aggregate(
        total=Coalesce(Sum("expected_revenue"), 0.0)
    )["total"]

    recent_leads = leads.filter(created_at__gte=thirty_days_ago).count()
    recent_won = leads.filter(
        stage_id__in=won_stage_ids, updated_at__gte=thirty_days_ago
    ).count()

    contacts_count = Contact.objects.filter(org=org).count()
    members_count = AmplexOrgMember.objects.filter(org=org, active=True).count()

    stages = Stage.objects.filter(org=org).order_by("sequence")
    stage_breakdown = []
    for s in stages:
        count = leads.filter(stage=s).count()
        stage_breakdown.append({"name": s.name, "count": count})

    subscription = None
    try:
        shared_org = SharedOrganization.objects.filter(slug=slug).first()
        if shared_org:
            sub = SharedSubscription.objects.filter(
                organization_id=shared_org.id, status="active"
            ).first()
            if sub:
                subscription = {
                    "plan_id": sub.plan_id,
                    "status": sub.status,
                }
    except (ValueError, TypeError):
        logger.warning("Failed to fetch subscription for slug=%s", slug)

    return JsonResponse(
        {
            "client_slug": slug,
            "total_leads": total_leads,
            "total_opportunities": total_opportunities,
            "won": won,
            "lost": lost,
            "revenue": float(revenue),
            "recent_leads_30d": recent_leads,
            "recent_won_30d": recent_won,
            "contacts": contacts_count,
            "members": members_count,
            "stages": stage_breakdown,
            "subscription": subscription,
        }
    )


@require_http_methods(["POST"])
@require_api_key
def create_opportunity(request):
    """Create an opportunity from Nexus conversation."""
    body = json.loads(request.body)

    slug = body.get("client_slug", "")
    org = AmplexOrganization.objects.filter(slug=slug).first()
    if not org:
        return JsonResponse({"detail": "Organization not found"}, status=404)

    title = body.get("title", "Opportunity from Nexus")
    contact_data = body.get("contact", {})

    contact = None
    if contact_data:
        email = contact_data.get("email", "")
        phone = contact_data.get("phone", "")
        if email:
            contact = Contact.objects.filter(org=org, email=email).first()
        if not contact and phone:
            contact = Contact.objects.filter(org=org, phone=phone).first()
        if not contact:
            contact = Contact.objects.create(
                org=org,
                name=contact_data.get("name", ""),
                email=email,
                phone=phone,
            )

    stage = Stage.objects.filter(org=org).order_by("sequence").first()

    lead = Lead.objects.create(
        org=org,
        name=title,
        type="opportunity",
        contact=contact,
        stage=stage,
        expected_revenue=body.get("value", 0),
        description=body.get("description", ""),
    )

    return JsonResponse({"id": lead.id, "name": lead.name}, status=201)


@require_http_methods(["POST"])
@require_api_key
def import_contacts(request):
    """Import enriched contacts from Entity."""
    body = json.loads(request.body)

    slug = body.get("client_slug", "")
    org = AmplexOrganization.objects.filter(slug=slug).first()
    if not org:
        return JsonResponse({"detail": "Organization not found"}, status=404)

    contacts = body.get("contacts", [])
    imported = 0

    for c in contacts:
        email = c.get("email", "")
        phone = c.get("phone", "")
        name = c.get("name", "")

        existing = None
        if email:
            existing = Contact.objects.filter(org=org, email=email).first()
        if not existing and phone:
            existing = Contact.objects.filter(org=org, phone=phone).first()

        if existing:
            if name and not existing.name:
                existing.name = name
            if c.get("vat") and not existing.vat:
                existing.vat = c["vat"]
            existing.save()
        else:
            Contact.objects.create(
                org=org,
                name=name,
                email=email,
                phone=phone,
                vat=c.get("vat", ""),
                city=c.get("city", ""),
                state_name=c.get("state", ""),
            )
            imported += 1

    return JsonResponse({"imported": imported, "total": len(contacts)})


@require_http_methods(["GET"])
@require_api_key
def get_opportunity(request, opp_id):
    """Get opportunity details for Nexus."""
    slug = request.GET.get("client_slug", "")
    if not slug:
        return JsonResponse({"detail": "client_slug required"}, status=400)

    org = AmplexOrganization.objects.filter(slug=slug).first()
    if not org:
        return JsonResponse({"detail": "Organization not found"}, status=404)

    lead = Lead.objects.filter(id=opp_id, org=org, type="opportunity").first()
    if not lead:
        return JsonResponse({"detail": "Opportunity not found"}, status=404)

    return JsonResponse(
        {
            "id": lead.id,
            "name": lead.name,
            "stage": (
                {"id": lead.stage_id, "name": lead.stage.name} if lead.stage else None
            ),
            "expected_revenue": lead.expected_revenue,
            "probability": lead.probability,
            "contact": (
                {"id": lead.contact_id, "name": lead.contact.name}
                if lead.contact
                else None
            ),
            "active": lead.active,
            "created_at": lead.created_at.isoformat(),
            "updated_at": lead.updated_at.isoformat(),
        }
    )


@require_http_methods(["PUT"])
@require_api_key
def update_opportunity_stage(request, opp_id):
    """Update opportunity stage for Nexus."""
    body = json.loads(request.body)

    slug = body.get("client_slug", "")
    if not slug:
        return JsonResponse({"detail": "client_slug required"}, status=400)

    org = AmplexOrganization.objects.filter(slug=slug).first()
    if not org:
        return JsonResponse({"detail": "Organization not found"}, status=404)

    lead = Lead.objects.filter(id=opp_id, org=org, type="opportunity").first()
    if not lead:
        return JsonResponse({"detail": "Opportunity not found"}, status=404)

    stage_id = body.get("stage_id")
    stage = Stage.objects.filter(id=stage_id, org=org).first()
    if not stage:
        return JsonResponse({"detail": "Stage not found"}, status=404)

    lead.stage = stage
    lead.save(update_fields=["stage", "updated_at"])

    return JsonResponse({"id": lead.id, "stage": {"id": stage.id, "name": stage.name}})


@require_http_methods(["GET"])
@require_api_key
def search_contacts(request):
    """Search contacts for Nexus/Entity."""
    slug = request.GET.get("client_slug", "")
    if not slug:
        return JsonResponse({"detail": "client_slug required"}, status=400)

    org = AmplexOrganization.objects.filter(slug=slug).first()
    if not org:
        return JsonResponse({"detail": "Organization not found"}, status=404)

    q = request.GET.get("q", "").strip()
    qs = Contact.objects.filter(org=org)
    if q:
        qs = qs.filter(
            Q(name__icontains=q) | Q(email__icontains=q) | Q(phone__icontains=q)
        )

    results = list(
        qs.order_by("-updated_at")[:50].values(
            "id", "name", "email", "phone", "vat", "city"
        )
    )
    return JsonResponse({"results": results})
