"""Lost reason views."""

import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import LostReason


@require_http_methods(["GET"])
@org_required
def list_lost_reasons(request, slug):
    org = request.amplex_org
    reasons = LostReason.objects.filter(org=org, active=True).order_by("name")
    return JsonResponse({"items": [{"id": r.id, "name": r.name} for r in reasons]})


@require_http_methods(["POST"])
@org_admin_required
def create_lost_reason(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    name = (body.get("name") or "").strip()
    if not name:
        return JsonResponse({"detail": "name is required"}, status=400)

    reason, created = LostReason.objects.get_or_create(org=org, name=name)
    return JsonResponse(
        {"id": reason.id, "name": reason.name},
        status=201 if created else 200,
    )


@require_http_methods(["DELETE"])
@org_admin_required
def delete_lost_reason(request, slug, reason_id):
    org = request.amplex_org
    reason = LostReason.objects.filter(id=reason_id, org=org).first()
    if not reason:
        return JsonResponse({"detail": "Not found"}, status=404)

    reason.active = False
    reason.save(update_fields=["active"])
    return JsonResponse({"deleted": True})
