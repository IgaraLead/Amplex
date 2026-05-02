"""Permission views."""

import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required, org_required
from api.models import AmplexOrgMember

PERMISSION_DEFAULTS = {
    "view_all_leads": False,
    "view_all_contacts": False,
    "edit_contacts": True,
    "delete_leads": False,
    "export_data": False,
    "manage_pipeline": False,
}


def get_user_permission(member, key):
    """Return permission value from member.permissions JSON dict."""
    perms = member.user.permissions or {}
    return perms.get(key, PERMISSION_DEFAULTS.get(key, False))


@require_http_methods(["GET"])
@org_required
def list_permissions(request, slug):
    org = request.amplex_org
    user = request.amplex_user

    member = AmplexOrgMember.objects.filter(org=org, user_id=user["user_id"]).first()
    if not member:
        return JsonResponse({"detail": "Not a member"}, status=403)

    members = AmplexOrgMember.objects.filter(org=org, active=True).select_related(
        "user"
    )
    users = []
    for org_member in members:
        if not org_member.user.active:
            continue
        perms = org_member.user.permissions or {}
        users.append(
            {
                "id": org_member.user.id,
                "name": org_member.user.name,
                "email": org_member.user.email,
                "role": org_member.role,
                "permissions": {
                    key: perms.get(key, default)
                    for key, default in PERMISSION_DEFAULTS.items()
                },
            }
        )

    return JsonResponse({"users": users})


@require_http_methods(["PUT"])
@org_admin_required
def update_permission(request, slug, user_id):
    org = request.amplex_org
    body = json.loads(request.body)

    member = AmplexOrgMember.objects.filter(org=org, user_id=user_id).first()
    if not member:
        return JsonResponse({"detail": "Member not found"}, status=404)

    incoming_permissions = body.get("permissions", body)
    perms = member.user.permissions or {}
    for key in PERMISSION_DEFAULTS:
        if key in incoming_permissions:
            perms[key] = bool(incoming_permissions[key])

    member.user.permissions = perms
    member.user.save(update_fields=["permissions"])
    return JsonResponse({"permissions": perms})


@require_http_methods(["PUT"])
@org_admin_required
def bulk_update_permissions(request, slug):
    org = request.amplex_org
    body = json.loads(request.body)

    updates = body.get("updates", [])
    results = []

    for item in updates:
        uid = item.get("user_id")
        member = AmplexOrgMember.objects.filter(org=org, user_id=uid).first()
        if not member:
            continue

        perms = member.user.permissions or {}
        for key in PERMISSION_DEFAULTS:
            if key in item:
                perms[key] = bool(item[key])

        member.user.permissions = perms
        member.user.save(update_fields=["permissions"])
        results.append({"user_id": uid, "permissions": perms})

    return JsonResponse({"results": results})
