"""Hub user management proxy views."""

import json

import httpx
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required
from api.models import AmplexOrgMember, AmplexUser


def _hub_request(method, path, **kwargs):
    url = f"{settings.HUB_URL}{path}"
    headers = kwargs.pop("headers", {})
    headers["X-Api-Key"] = settings.HUB_API_KEY
    return httpx.request(method, url, headers=headers, timeout=10, **kwargs)


@require_http_methods(["GET"])
@org_admin_required
def list_hub_users(request, slug):
    org = request.amplex_org
    slug = org.slug or ""
    if not slug:
        return JsonResponse({"items": []})

    resp = _hub_request("GET", f"/api/v1/c/{slug}/users")
    if resp.status_code != 200:
        return JsonResponse({"items": []})

    data = resp.json()
    return JsonResponse({"items": data.get("users", data.get("items", []))})


@require_http_methods(["POST"])
@org_admin_required
def create_hub_user(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)
    slug = org.slug or ""
    if not slug:
        return JsonResponse({"detail": "Org has no slug"}, status=400)

    resp = _hub_request("POST", f"/api/v1/c/{slug}/users", json=body)
    if resp.status_code not in (200, 201):
        return JsonResponse(resp.json(), status=resp.status_code)

    hub_user = resp.json()

    user, _ = AmplexUser.objects.get_or_create(
        hub_id=str(hub_user.get("id", "")),
        defaults={
            "name": hub_user.get("name", ""),
            "email": hub_user.get("email", ""),
            "login": hub_user.get("email", ""),
        },
    )
    AmplexOrgMember.objects.get_or_create(
        org=org, user=user, defaults={"role": body.get("role", "member")}
    )

    return JsonResponse(hub_user, status=201)


@require_http_methods(["PUT"])
@org_admin_required
def update_hub_user(request, slug, hub_user_id):
    org = request.amplex_org
    body = json.loads(request.body)
    slug = org.slug or ""
    if not slug:
        return JsonResponse({"detail": "Org has no slug"}, status=400)

    resp = _hub_request("PUT", f"/api/v1/c/{slug}/users/{hub_user_id}", json=body)
    if resp.status_code != 200:
        return JsonResponse(resp.json(), status=resp.status_code)

    return JsonResponse(resp.json())


@require_http_methods(["DELETE"])
@org_admin_required
def deactivate_hub_user(request, slug, hub_user_id):
    org = request.amplex_org
    slug = org.slug or ""
    if not slug:
        return JsonResponse({"detail": "Org has no slug"}, status=400)

    resp = _hub_request("DELETE", f"/api/v1/c/{slug}/users/{hub_user_id}")
    if resp.status_code not in (200, 204):
        return JsonResponse(resp.json(), status=resp.status_code)

    return JsonResponse({"deactivated": True})
