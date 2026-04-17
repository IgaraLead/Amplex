"""User views."""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_required
from api.models import AmplexOrgMember


@require_http_methods(["GET"])
@org_required
def list_users(request, slug):
    org = request.amplex_org
    members = AmplexOrgMember.objects.filter(org=org, active=True).select_related(
        "user"
    )

    return JsonResponse(
        {
            "items": [
                {
                    "id": m.user.id,
                    "name": m.user.name,
                    "email": m.user.email,
                    "role": m.role,
                    "avatar_url": m.user.avatar_url or "",
                }
                for m in members
                if m.user.active
            ]
        }
    )
