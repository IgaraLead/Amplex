"""Config views — minimal client hints for standalone Amplex."""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import get_org_context, login_required


@require_http_methods(["GET"])
@login_required
def get_config(request):
    return JsonResponse({"standalone": True})


@require_http_methods(["GET"])
def get_scoped_config(request, slug):
    _user, _org, error = get_org_context(request, slug)
    if error:
        return error
    return get_config(request)
