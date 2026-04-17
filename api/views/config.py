"""Config views — product URLs for ProductSwitcher."""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import login_required
from api.ecosystem import product_url


@require_http_methods(["GET"])
@login_required
def get_config(request):
    return JsonResponse(
        {
            "hub_url": product_url("hub"),
            "nexus_url": product_url("nexus"),
            "entity_url": product_url("entity"),
            "amplex_url": product_url("amplex"),
        }
    )
