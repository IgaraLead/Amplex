"""Config views — product URLs for ProductSwitcher."""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import get_org_context, login_required
from api.ecosystem import product_url


@require_http_methods(["GET"])
@login_required
def get_config(request):
    hub = product_url("hub")
    return JsonResponse(
        {
            "control_plane_url": hub,
            "hub_url": hub,
            "nexus_url": product_url("nexus"),
            "entity_url": product_url("entity"),
            "amplex_url": product_url("amplex"),
        }
    )


@require_http_methods(["GET"])
def get_scoped_config(request, slug):
    _user, _org, error = get_org_context(request, slug)
    if error:
        return error
    return get_config(request)
