"""Organization user management (Amplex-local; no Hub proxy)."""

import json

from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import org_admin_required
from api.models import AmplexOrgMember, AmplexUser
from api.quota_utils import check_amplex_member_limit_or_403


def _normalize_org_role(raw: str) -> str:
    r = (raw or "member").strip().lower()
    if r in ("admin", "administrator"):
        return "administrator"
    return "member"


@require_http_methods(["GET"])
@org_admin_required
def list_hub_users(request, slug):
    _ = slug
    org = request.amplex_org
    qs = AmplexOrgMember.objects.filter(org=org, active=True).select_related("user")
    items = [
        {
            "id": m.user.id,
            "email": m.user.email,
            "name": m.user.name,
            "role": m.role,
            "hub_id": m.user.hub_id,
        }
        for m in qs
    ]
    return JsonResponse({"items": items, "users": items})


@require_http_methods(["POST"])
@org_admin_required
def create_hub_user(request, slug):
    _ = slug
    org = request.amplex_org
    body = json.loads(request.body)
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip() or email.split("@")[0]
    password = body.get("password") or body.get("senha") or ""
    if not email or not password:
        return JsonResponse({"detail": "email e password são obrigatórios"}, status=400)

    role = _normalize_org_role(body.get("role", "member"))

    with transaction.atomic():
        if AmplexUser.objects.filter(email=email).exists():
            user = AmplexUser.objects.select_for_update().get(email=email)
        else:
            user = AmplexUser.objects.create(
                email=email,
                name=name,
                login=email,
                password_hash=make_password(password),
                hub_id=None,
            )
        blocked = check_amplex_member_limit_or_403(org, user)
        if blocked:
            return blocked
        AmplexOrgMember.objects.update_or_create(
            org=org,
            user=user,
            defaults={"role": role, "active": True},
        )

    return JsonResponse(
        {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": role,
        },
        status=201,
    )


@require_http_methods(["PUT"])
@org_admin_required
def update_hub_user(request, slug, hub_user_id):
    _ = slug
    org = request.amplex_org
    body = json.loads(request.body)
    try:
        uid = int(hub_user_id)
    except (TypeError, ValueError):
        return JsonResponse({"detail": "ID de usuário inválido"}, status=400)

    m = AmplexOrgMember.objects.filter(org=org, user_id=uid, active=True).first()
    if not m:
        return JsonResponse({"detail": "Usuário não encontrado nesta org"}, status=404)

    user = m.user
    if "name" in body:
        user.name = (body.get("name") or "").strip() or user.name
    if "email" in body:
        ne = (body.get("email") or "").strip().lower()
        if ne and ne != user.email:
            if AmplexUser.objects.filter(email=ne).exclude(id=user.id).exists():
                return JsonResponse({"detail": "E-mail já em uso"}, status=400)
            user.email = ne
            user.login = ne
    if body.get("role") is not None:
        m.role = _normalize_org_role(body.get("role"))
        m.save(update_fields=["role"])
    pwd = body.get("password") or body.get("senha")
    if pwd:
        user.password_hash = make_password(pwd)
    user.save()
    return JsonResponse(
        {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": m.role,
        }
    )


@require_http_methods(["DELETE"])
@org_admin_required
def deactivate_hub_user(request, slug, hub_user_id):
    _ = slug
    org = request.amplex_org
    try:
        uid = int(hub_user_id)
    except (TypeError, ValueError):
        return JsonResponse({"detail": "ID de usuário inválido"}, status=400)

    m = AmplexOrgMember.objects.filter(org=org, user_id=uid).first()
    if not m:
        return JsonResponse({"detail": "Usuário não encontrado"}, status=404)

    m.active = False
    m.save(update_fields=["active"])
    return JsonResponse({"deactivated": True})
