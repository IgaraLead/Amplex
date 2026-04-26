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


def _normalize_integrations_payload(payload):
    """Normalize Hub settings payload into UI-friendly integration actions."""
    data = payload if isinstance(payload, dict) else {}
    active = data.get("active_products") or data.get("products") or {}
    if isinstance(active, list):
        active = dict.fromkeys(active, True)

    actions = []
    if active.get("nexus"):
        actions.append(
            {
                "key": "open_conversation",
                "label": "Abrir conversa no Nexus",
                "description": "Cria/abre uma conversa para o lead no Nexus.",
                "target": "nexus",
                "target_url": getattr(settings, "NEXUS_URL", ""),
                "endpoint": "/id/{slug}/igaralead/api/conversations/find_or_create",
                "method": "POST",
            }
        )
    if active.get("entity"):
        actions.append(
            {
                "key": "lookup_cnpj",
                "label": "Consultar CNPJ",
                "description": "Consulta dados de CNPJ no Entity.",
                "target": "entity",
                "target_url": getattr(settings, "ENTITY_URL", ""),
                "endpoint": "/api/v1/id/{slug}/search",
                "method": "GET",
            }
        )

    return {"integrations": data, "actions": actions}


@require_http_methods(["GET"])
@org_required
def get_integrations(request, slug):
    org = request.amplex_org
    slug = org.slug or ""
    if not slug:
        return JsonResponse({"integrations": {}})

    candidates = [
        f"{settings.HUB_URL}/api/v1/c/{slug}/settings",
        f"{settings.HUB_URL}/api/v1/id/{slug}/settings",
    ]

    for url in candidates:
        try:
            resp = httpx.get(
                url,
                headers={"X-Api-Key": settings.HUB_API_KEY},
                timeout=10,
            )
            if resp.status_code == 200:
                return JsonResponse(_normalize_integrations_payload(resp.json()))
        except httpx.HTTPError:
            logger.warning("Hub settings request failed slug=%s url=%s", slug, url)

    return JsonResponse(_normalize_integrations_payload({}))


@require_http_methods(["POST"])
@org_required
def open_nexus_conversation(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    contact_id = body.get("contact_id")
    lead_id = body.get("lead_id")
    message = body.get("message", "")

    contact = (
        Contact.objects.filter(id=contact_id, org=org).first() if contact_id else None
    )
    if not contact and lead_id:
        lead = (
            Lead.objects.filter(id=lead_id, org=org).select_related("contact").first()
        )
        contact = lead.contact if lead else None

    if not contact:
        return JsonResponse({"detail": "Contact not found for this lead"}, status=404)

    nexus_url = getattr(settings, "NEXUS_URL", "")
    nexus_api_key = getattr(settings, "NEXUS_API_KEY", "")
    if not nexus_url or not nexus_api_key:
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
            f"{nexus_url}/id/{slug}/igaralead/api/conversations/find_or_create",
            json=payload,
            headers={"X-Api-Key": nexus_api_key},
            timeout=10,
        )
        if resp.status_code >= 400:
            return JsonResponse(
                {"detail": "Failed to create/find conversation in Nexus"},
                status=resp.status_code,
            )
        conv_data = resp.json()

        if message and conv_data.get("id"):
            httpx.post(
                f"{nexus_url}/id/{slug}/igaralead/api/messages",
                json={
                    "conversation_id": conv_data["id"],
                    "content": message,
                    "source_product": "amplex",
                    "client_slug": slug,
                },
                headers={"X-Api-Key": nexus_api_key},
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
    cnpj = (body.get("cnpj", "") or "").strip()
    if not cnpj and lead_id:
        lead = (
            Lead.objects.filter(id=lead_id, org=org).select_related("contact").first()
        )
        if lead and lead.contact and lead.contact.vat:
            cnpj = lead.contact.vat

    entity_url = getattr(settings, "ENTITY_URL", "")
    entity_api_key = getattr(settings, "ENTITY_API_KEY", "")
    if not entity_url or not entity_api_key:
        return JsonResponse({"detail": "Entity not configured"}, status=503)
    if not cnpj:
        return JsonResponse({"detail": "cnpj is required"}, status=400)

    slug = org.slug or ""
    candidate_urls = [
        (
            f"{entity_url}/api/v1/integrations/enrich",
            "POST",
            {"cnpj": cnpj, "client_slug": slug},
        ),
        (f"{entity_url}/api/v1/c/{slug}/search", "GET", {"q": cnpj}),
        (f"{entity_url}/api/v1/id/{slug}/search", "GET", {"q": cnpj}),
    ]
    try:
        data = None
        for url, method, payload in candidate_urls:
            if method == "POST":
                resp = httpx.post(
                    url,
                    json=payload,
                    headers={"X-Api-Key": entity_api_key},
                    timeout=15,
                )
            else:
                resp = httpx.get(
                    url,
                    params=payload,
                    headers={"X-Api-Key": entity_api_key},
                    timeout=15,
                )
            if resp.status_code == 200:
                data = resp.json()
                break
        if data is None:
            return JsonResponse({"detail": "Entity lookup failed"}, status=502)

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
