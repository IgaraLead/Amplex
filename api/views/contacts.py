"""Contact views."""

import json

from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Contact, Lead


@require_http_methods(["GET"])
@org_required
def list_contacts(request, slug):
    org = request.amplex_org
    page = int(request.GET.get("page", 1))
    limit = min(int(request.GET.get("limit", 20)), 100)
    search = request.GET.get("search")
    contact_type = request.GET.get("type")

    qs = Contact.objects.filter(active=True, org=org)

    if contact_type == "company":
        qs = qs.filter(is_company=True)
    elif contact_type == "person":
        qs = qs.filter(is_company=False)

    if search:
        qs = qs.filter(
            Q(name__icontains=search)
            | Q(email__icontains=search)
            | Q(phone__icontains=search)
        )

    total = qs.count()
    offset = (page - 1) * limit
    contacts = list(qs.order_by("name")[offset : offset + limit])

    items = []
    for c in contacts:
        opp_count = Lead.objects.filter(contact=c, active=True, org=org).count()
        items.append(
            {
                "id": c.id,
                "name": c.name,
                "email": c.email or "",
                "phone": c.phone or "",
                "mobile": c.mobile or "",
                "is_company": c.is_company,
                "city": c.city or "",
                "state": c.state_name or "",
                "opportunity_count": opp_count,
            }
        )

    return JsonResponse(
        {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit if total else 0,
        }
    )


@require_http_methods(["POST"])
@org_required
def create_contact(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    name = (body.get("name") or "").strip()
    if not name:
        return JsonResponse({"detail": "name is required"}, status=400)

    contact = Contact.objects.create(
        name=name,
        org=org,
        email=body.get("email", ""),
        phone=body.get("phone", ""),
        mobile=body.get("mobile", ""),
        is_company=body.get("is_company", False),
        street=body.get("street", ""),
        city=body.get("city", ""),
        vat=body.get("cnpj", ""),
    )
    return JsonResponse({"id": contact.id, "name": contact.name}, status=201)


@require_http_methods(["GET"])
@org_required
def get_contact(request, slug, contact_id):
    org = request.amplex_org
    contact = Contact.objects.filter(id=contact_id, org=org).first()
    if not contact:
        return JsonResponse({"detail": "Not found"}, status=404)

    return JsonResponse(
        {
            "id": contact.id,
            "name": contact.name,
            "email": contact.email or "",
            "phone": contact.phone or "",
            "mobile": contact.mobile or "",
            "is_company": contact.is_company,
            "street": contact.street or "",
            "street2": contact.street2 or "",
            "city": contact.city or "",
            "state_id": None,
            "state_name": contact.state_name or "",
            "country_id": None,
            "country_name": contact.country_name or "",
            "vat": contact.vat or "",
            "website": contact.website or "",
            "comment": contact.comment or "",
        }
    )
