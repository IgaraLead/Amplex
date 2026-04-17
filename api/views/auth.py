"""Auth routes — login, refresh, user info, and logout."""

import json
import logging

from django.contrib.auth.hashers import check_password
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.auth_utils import clear_auth_cookies, login_required, set_auth_cookies
from api.hub_auth import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)
from api.models import AmplexOrgMember, SharedUser

logger = logging.getLogger(__name__)


@require_http_methods(["POST"])
def login(request):
    body = json.loads(request.body)
    email = body.get("email", "").lower().strip()
    password = body.get("password", "")
    if not email or not password:
        return JsonResponse({"error": "E-mail e senha são obrigatórios"}, status=400)

    user = SharedUser.objects.filter(email=email).first()
    if not user or not user.active:
        return JsonResponse({"error": "Credenciais inválidas"}, status=401)

    if not check_password(password, user.password_hash):
        return JsonResponse({"error": "Credenciais inválidas"}, status=401)

    # Platform access check
    roles = user.roles if isinstance(user.roles, list) else []
    if "super_admin" not in roles:
        has_amplex = any(
            m.get("active_products", {}).get("amplex")
            for m in _get_memberships_for_token(user)
        )
        if not has_amplex:
            return JsonResponse(
                {"error": "Sua organização não possui acesso ao Amplex"},
                status=403,
            )

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(user)
    response = JsonResponse({"access_token": access_token, "token_type": "bearer"})
    set_auth_cookies(response, access_token, refresh_token)
    return response


def _get_memberships_for_token(user):
    """Helper to build membership dicts from shared DB."""
    from api.models import SharedMembership, SharedOrganization

    memberships = []
    for m in SharedMembership.objects.filter(user_id=user.id):
        org = SharedOrganization.objects.filter(id=m.organization_id).first()
        if org:
            memberships.append({"active_products": org.active_products or {}})
    return memberships


@require_http_methods(["POST"])
def refresh(request):
    token = request.COOKIES.get("amplex_refresh")
    if not token:
        return JsonResponse({"error": "Refresh token ausente"}, status=401)

    try:
        claims = decode_refresh_token(token)
    except ValueError:
        return JsonResponse({"error": "Refresh token inválido"}, status=401)

    user = SharedUser.objects.filter(id=claims.get("sub")).first()
    if not user or not user.active:
        return JsonResponse({"error": "Usuário não encontrado"}, status=401)

    access_token = create_access_token(str(user.id))
    new_refresh = create_refresh_token(user)
    response = JsonResponse({"access_token": access_token, "token_type": "bearer"})
    set_auth_cookies(response, access_token, new_refresh)
    return response


@require_http_methods(["GET"])
@login_required
def me(request):
    user = request.amplex_user
    memberships = AmplexOrgMember.objects.filter(
        user_id=user["user_id"]
    ).select_related("org")

    orgs = []
    for m in memberships:
        if m.org.active:
            orgs.append(
                {
                    "id": m.org.id,
                    "slug": m.org.slug,
                    "hub_org_id": m.org.hub_org_id,
                    "name": m.org.name,
                    "role": m.role,
                }
            )

    return JsonResponse(
        {
            "user_id": user["user_id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "hub_id": user["hub_id"],
            "organizations": orgs,
        }
    )


@require_http_methods(["POST"])
def logout(request):
    response = JsonResponse({"message": "Logout realizado"})
    clear_auth_cookies(response)
    return response
