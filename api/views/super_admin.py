"""Super-admin platform views."""

import json

from django.db.models import Count
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import login_required
from api.models import AmplexOrganization, AmplexOrgMember, Contact, Lead


def _require_super_admin(request):
    user = request.amplex_user
    if not user.get("is_super_admin"):
        return JsonResponse({"detail": "Permissão negada"}, status=403)
    return None


@require_http_methods(["GET"])
@login_required
def overview(request):
    denied = _require_super_admin(request)
    if denied:
        return denied

    active_orgs = AmplexOrganization.objects.filter(active=True).count()
    active_members = AmplexOrgMember.objects.filter(active=True).count()
    leads = Lead.objects.filter(active=True).count()
    contacts = Contact.objects.filter(active=True).count()
    return JsonResponse(
        {
            "metrics": {
                "active_orgs": active_orgs,
                "active_members": active_members,
                "active_leads": leads,
                "active_contacts": contacts,
            }
        }
    )


@require_http_methods(["GET"])
@login_required
def organizations(request):
    denied = _require_super_admin(request)
    if denied:
        return denied

    orgs = (
        AmplexOrganization.objects.filter(active=True)
        .annotate(
            members_count=Count("members", distinct=True),
            leads_count=Count("leads", distinct=True),
            contacts_count=Count("contacts", distinct=True),
        )
        .order_by("name")
    )
    return JsonResponse(
        {
            "items": [
                {
                    "id": org.id,
                    "name": org.name,
                    "slug": org.slug,
                    "hub_org_id": org.hub_org_id,
                    "platform_quotas": org.platform_quotas or {},
                    "members_count": org.members_count,
                    "leads_count": org.leads_count,
                    "contacts_count": org.contacts_count,
                }
                for org in orgs
            ]
        }
    )


@require_http_methods(["GET", "PATCH"])
@login_required
def organization_quotas(request, slug):
    denied = _require_super_admin(request)
    if denied:
        return denied

    org = AmplexOrganization.objects.filter(slug=slug, active=True).first()
    if not org:
        return JsonResponse({"detail": "Organização não encontrada"}, status=404)

    if request.method == "GET":
        return JsonResponse(
            {
                "slug": org.slug,
                "name": org.name,
                "platform_quotas": org.platform_quotas or {},
            }
        )

    body = json.loads(request.body or "{}")
    pq = body.get("platform_quotas")
    if pq is None:
        return JsonResponse({"detail": "platform_quotas é obrigatório"}, status=400)
    if not isinstance(pq, dict):
        return JsonResponse({"detail": "platform_quotas must be an object"}, status=400)
    org.platform_quotas = {**(org.platform_quotas or {}), **pq}
    org.save(update_fields=["platform_quotas", "updated_at"])
    return JsonResponse(
        {
            "slug": org.slug,
            "platform_quotas": org.platform_quotas or {},
        }
    )
