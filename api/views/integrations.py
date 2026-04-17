"""Integration views — Hub, Nexus, Entity proxies."""

import json
import logging

import httpx
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Contact, Lead

logger = logging.getLogger(__name__)


@require_http_methods(["GET"])
@org_required
def get_integrations(request, slug):
    org = request.amplex_org
    slug = org.slug or ""
    if not slug:
        return JsonResponse({"integrations": {}})

    try:
        resp = httpx.get(
            f"{settings.HUB_URL}/api/v1/c/{slug}/settings",
            headers={"X-Api-Key": settings.HUB_API_KEY},
            timeout=10,
        )
        if resp.status_code == 200:
            return JsonResponse({"integrations": resp.json()})
    except httpx.HTTPError:
        pass

    return JsonResponse({"integrations": {}})


@require_http_methods(["POST"])
@org_required
def open_nexus_conversation(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    contact_id = body.get("contact_id")
    message = body.get("message", "")
    if not contact_id:
        return JsonResponse({"detail": "contact_id is required"}, status=400)

    contact = Contact.objects.filter(id=contact_id, org=org).first()
    if not contact:
        return JsonResponse({"detail": "Contact not found"}, status=404)

    nexus_url = getattr(settings, "NEXUS_URL", "")
    if not nexus_url:
        return JsonResponse({"detail": "Nexus not configured"}, status=503)

    slug = org.slug or ""
    payload = {
        "contact": {
            "name": contact.name,
            "email": contact.email or "",
            "phone": contact.phone or "",
        },
        "source_product": "amplex",
        "client_slug": slug,
    }

    try:
        resp = httpx.post(
            f"{nexus_url}/igaralead/api/conversations/find_or_create",
            json=payload,
            headers={"X-Api-Key": settings.NEXUS_API_KEY},
            timeout=10,
        )
        conv_data = resp.json()

        if message and conv_data.get("id"):
            httpx.post(
                f"{nexus_url}/igaralead/api/messages",
                json={
                    "conversation_id": conv_data["id"],
                    "content": message,
                    "source_product": "amplex",
                    "client_slug": slug,
                },
                headers={"X-Api-Key": settings.NEXUS_API_KEY},
                timeout=10,
            )

        return JsonResponse(conv_data)
    except httpx.HTTPError:
        logger.exception("Nexus conversation API error")
        return JsonResponse({"detail": "Failed to reach Nexus"}, status=502)


@require_http_methods(["POST"])
@org_required
def enrich_cnpj(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    lead_id = body.get("lead_id")
    cnpj = body.get("cnpj", "")
    if not cnpj:
        return JsonResponse({"detail": "cnpj is required"}, status=400)

    entity_url = getattr(settings, "ENTITY_URL", "")
    if not entity_url:
        return JsonResponse({"detail": "Entity not configured"}, status=503)

    slug = org.slug or ""
    try:
        resp = httpx.get(
            f"{entity_url}/api/v1/c/{slug}/search",
            params={"q": cnpj},
            headers={"X-Api-Key": settings.ENTITY_API_KEY},
            timeout=15,
        )
        if resp.status_code != 200:
            return JsonResponse(
                {"detail": "Entity lookup failed"}, status=resp.status_code
            )

        data = resp.json()

        if lead_id and data.get("results"):
            lead = Lead.objects.filter(id=lead_id, org=org).first()
            if lead:
                result = data["results"][0]
                lead.description = (
                    lead.description or ""
                ) + f"\n[CNPJ] {result.get('razao_social', '')}"
                lead.save(update_fields=["description"])

        return JsonResponse(data)
    except httpx.HTTPError:
        logger.exception("Entity CNPJ lookup error")
        return JsonResponse({"detail": "Failed to reach Entity"}, status=502)


@require_http_methods(["GET"])
@org_required
def search_lead(request, slug):
    org = request.amplex_org
    phone = request.GET.get("phone", "").strip()
    email = request.GET.get("email", "").strip()

    if not phone and not email:
        return JsonResponse({"detail": "phone or email required"}, status=400)

    contacts = Contact.objects.filter(org=org)
    if phone:
        contacts = contacts.filter(phone__icontains=phone)
    if email:
        contacts = contacts.filter(email__icontains=email)

    contact = contacts.first()
    if not contact:
        return JsonResponse({"lead": None, "contact": None})

    lead = (
        Lead.objects.filter(org=org, contact=contact, active=True)
        .order_by("-created_at")
        .first()
    )

    return JsonResponse(
        {
            "contact": {
                "id": contact.id,
                "name": contact.name,
                "email": contact.email or "",
                "phone": contact.phone or "",
            },
            "lead": (
                {
                    "id": lead.id,
                    "name": lead.name,
                    "stage": lead.stage.name if lead.stage else "",
                }
                if lead
                else None
            ),
        }
    )
