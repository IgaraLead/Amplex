"""Tag views."""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import Tag


@require_http_methods(["GET"])
@org_required
def list_tags(request, slug):
    org = request.amplex_org
    tags = Tag.objects.filter(org=org).order_by("name")
    return JsonResponse(
        {"items": [{"id": t.id, "name": t.name, "color": t.color or ""} for t in tags]}
    )
