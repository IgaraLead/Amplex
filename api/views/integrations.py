"""Org-scoped helpers — MVP standalone (no external product integrations)."""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Contact, Lead


@require_http_methods(["GET"])
@org_required
def get_integrations(request, slug):
    return JsonResponse({"integrations": {}, "actions": []})


def _standalone_integration_disabled():
    return JsonResponse(
        {"detail": "Integrações externas não estão disponíveis nesta edição."},
        status=503,
    )


@require_http_methods(["POST"])
@org_required
def open_nexus_conversation(request, slug):
    del slug  # URL kwarg — MVP standalone has no Nexus backend
    return _standalone_integration_disabled()


@require_http_methods(["POST"])
@org_required
def enrich_cnpj(request, slug):
    del slug
    return _standalone_integration_disabled()


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
