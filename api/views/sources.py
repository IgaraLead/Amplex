"""Source views."""

import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import Source


@require_http_methods(["GET"])
@org_required
def list_sources(request, slug):
    org = request.amplex_org
    sources = Source.objects.filter(org=org).order_by("name")
    return JsonResponse({"items": [{"id": s.id, "name": s.name} for s in sources]})


@require_http_methods(["POST"])
@org_admin_required
def create_source(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    name = (body.get("name") or "").strip()
    if not name:
        return JsonResponse({"detail": "name is required"}, status=400)

    source, created = Source.objects.get_or_create(org=org, name=name)
    return JsonResponse(
        {"id": source.id, "name": source.name},
        status=201 if created else 200,
    )
